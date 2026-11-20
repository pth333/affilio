import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, eq, jobs, newId, runMigrations, workspace, type DbHandle } from '#src/db/index.ts';
import { claimJobs, completeJob, deferJob, enqueue, failJob, heartbeat, nextUtcMidnight, retryDelayMs } from '#src/queue/index.ts';

describe('retryDelayMs / nextUtcMidnight', () => {
  it('backoff tăng gấp đôi và chặn ở 30 phút', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(50)).toBe(30 * 60_000);
  });

  it('nextUtcMidnight là 00:00 UTC hôm sau', () => {
    expect(nextUtcMidnight(new Date('2026-03-31T23:59:00Z')).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

/**
 * Test tích hợp: chỉ chạy khi có TEST_DATABASE_URL trỏ tới DB riêng tên kết thúc bằng "_test",
 * để không bao giờ ghi vào DB đang dùng.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;
const isTestDb = TEST_URL !== undefined && /_test(\?.*)?$/.test(TEST_URL);

describe.skipIf(!isTestDb)('hàng đợi Postgres (tích hợp)', () => {
  let handle: DbHandle;
  const workspaceId = newId('workspace');

  beforeAll(async () => {
    if (!TEST_URL) throw new Error('thiếu TEST_DATABASE_URL');
    handle = createDb(TEST_URL, { max: 6, appName: 'vm-test' });
    await runMigrations(handle.db);
    // Dọn job của các lần chạy trước để claim chỉ thấy job của test này.
    await handle.db.delete(jobs);
    await handle.db.insert(workspace).values({ id: workspaceId, name: 'queue-test' });
  });

  afterAll(async () => {
    if (!handle) return;
    await handle.db.delete(jobs).where(eq(jobs.workspaceId, workspaceId));
    await handle.db.delete(workspace).where(eq(workspace.id, workspaceId));
    await handle.close();
  });

  it('idempotency_key chặn job trùng', async () => {
    const key = `test:${newId('job')}`;
    const a = await enqueue(handle.db, { workspaceId, queue: 'llm', type: 't', idempotencyKey: key });
    const b = await enqueue(handle.db, { workspaceId, queue: 'llm', type: 't', idempotencyKey: key });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    await handle.db.delete(jobs).where(eq(jobs.id, a.job.id));
  });

  it('nhiều worker claim cùng lúc không lấy trùng job', async () => {
    await Promise.all(Array.from({ length: 10 }, () => enqueue(handle.db, { workspaceId, queue: 'render', type: 't' })));
    const claimed = await Promise.all(
      ['w1', 'w2', 'w3', 'w4'].map((w) => claimJobs(handle.db, { queue: 'render', workerId: w, lockSeconds: 60, limit: 4 })),
    );
    const ids = claimed.flat().map((j) => j.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    await handle.db.delete(jobs).where(eq(jobs.workspaceId, workspaceId));
  });

  it('vòng đời: claim → heartbeat → fail (retry) → defer → complete', async () => {
    const { job } = await enqueue(handle.db, { workspaceId, queue: 'llm', type: 't', maxAttempts: 2 });

    const [first] = await claimJobs(handle.db, { queue: 'llm', workerId: 'w1', lockSeconds: 60 });
    expect(first?.id).toBe(job.id);
    expect(first?.attempts).toBe(1);
    if (!first) throw new Error('không claim được');
    expect(await heartbeat(handle.db, job.id, 'w1', 60)).toBe(true);
    expect(await heartbeat(handle.db, job.id, 'w2', 60)).toBe(false);

    expect(await failJob(handle.db, first, 'w1', 'lỗi tạm')).toBe('retry');
    // Đang chờ backoff nên chưa claim lại được.
    expect(await claimJobs(handle.db, { queue: 'llm', workerId: 'w1', lockSeconds: 60 })).toHaveLength(0);

    await handle.db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.id, job.id));
    const [second] = await claimJobs(handle.db, { queue: 'llm', workerId: 'w1', lockSeconds: 60 });
    expect(second?.attempts).toBe(2);
    expect(await deferJob(handle.db, job.id, 'w1', new Date(0), 'hết hạn mức')).toBe(true);

    const [third] = await claimJobs(handle.db, { queue: 'llm', workerId: 'w2', lockSeconds: 60 });
    expect(third?.attempts).toBe(2); // defer không tính là một lần thử
    expect(await completeJob(handle.db, job.id, 'w1')).toBe(false); // w1 đã mất job
    expect(await completeJob(handle.db, job.id, 'w2')).toBe(true);

    const [row] = await handle.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row?.status).toBe('done');
  });

  it('hết lượt thử thì failed', async () => {
    const { job } = await enqueue(handle.db, { workspaceId, queue: 'llm', type: 't', maxAttempts: 1 });
    const [claimed] = await claimJobs(handle.db, { queue: 'llm', workerId: 'w1', lockSeconds: 60 });
    expect(claimed?.id).toBe(job.id);
    if (!claimed) throw new Error('không claim được');
    expect(await failJob(handle.db, claimed, 'w1', 'lỗi')).toBe('failed');
  });
});
