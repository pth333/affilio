import { and, asc, desc, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { Db, Executor } from '#src/db/index.ts';
import { newId } from '#src/db/id.ts';
import { jobs, type JobQueue } from '#src/db/schema.ts';

/**
 * Hàng đợi job trên Postgres (mục 2 plan v4):
 * - claim bằng SELECT … FOR UPDATE SKIP LOCKED, đặt locked_until
 * - worker gia hạn (heartbeat) khi đang chạy; worker chết thì job tự quay lại khi hết hạn giữ chỗ
 * - run_after để dời job (retry backoff, hết hạn mức), idempotency_key chặn job trùng
 */

export type Job = typeof jobs.$inferSelect;

export interface EnqueueInput {
  workspaceId: string;
  queue: JobQueue;
  type: string;
  payload?: Record<string, unknown>;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
  videoId?: string;
  batchId?: string;
}

export async function enqueue(db: Executor, input: EnqueueInput): Promise<{ job: Job; created: boolean }> {
  const [inserted] = await db
    .insert(jobs)
    .values({
      id: newId('job'),
      workspaceId: input.workspaceId,
      queue: input.queue,
      type: input.type,
      payload: input.payload ?? {},
      priority: input.priority ?? 0,
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
      idempotencyKey: input.idempotencyKey ?? null,
      videoId: input.videoId ?? null,
      batchId: input.batchId ?? null,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning();
  if (inserted) return { job: inserted, created: true };

  if (!input.idempotencyKey) throw new Error('enqueue không chèn được job mà không có idempotency_key');
  const [existing] = await db.select().from(jobs).where(eq(jobs.idempotencyKey, input.idempotencyKey));
  if (!existing) throw new Error(`không tìm thấy job theo idempotency_key ${input.idempotencyKey}`);
  return { job: existing, created: false };
}

export interface ClaimInput {
  queue: JobQueue;
  workerId: string;
  lockSeconds: number;
  limit?: number;
}

/** Lấy tối đa `limit` job sẵn sàng; nhiều worker gọi cùng lúc không bao giờ lấy trùng. */
export async function claimJobs(db: Db, { queue, workerId, lockSeconds, limit = 1 }: ClaimInput): Promise<Job[]> {
  const candidates = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.queue, queue), eq(jobs.status, 'queued'), lte(jobs.runAfter, sql`now()`)))
    .orderBy(desc(jobs.priority), asc(jobs.runAfter), asc(jobs.createdAt))
    .limit(limit)
    .for('update', { skipLocked: true });

  return db
    .update(jobs)
    .set({
      status: 'running',
      lockedBy: workerId,
      lockedUntil: sql`now() + make_interval(secs => ${lockSeconds})`,
      attempts: sql`${jobs.attempts} + 1`,
    })
    .where(inArray(jobs.id, candidates))
    .returning();
}

/** Gia hạn giữ chỗ. Trả false nếu đã mất job (hết hạn và worker khác lấy). */
export async function heartbeat(db: Db, jobId: string, workerId: string, lockSeconds: number): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ lockedUntil: sql`now() + make_interval(secs => ${lockSeconds})` })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, 'running')))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

export async function completeJob(db: Db, jobId: string, workerId: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: 'done', finishedAt: sql`now()`, lockedBy: null, lockedUntil: null, lastError: null })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, 'running')))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/** Thời gian chờ trước lần thử lại: 30s, 60s, 120s… tối đa 30 phút. */
export function retryDelayMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

export type FailOutcome = 'retry' | 'failed' | 'lost';

export async function failJob(db: Db, job: Job, workerId: string, error: string): Promise<FailOutcome> {
  const exhausted = job.attempts >= job.maxAttempts;
  const rows = await db
    .update(jobs)
    .set(
      exhausted
        ? { status: 'failed', finishedAt: sql`now()`, lockedBy: null, lockedUntil: null, lastError: error }
        : {
            status: 'queued',
            runAfter: new Date(Date.now() + retryDelayMs(job.attempts)),
            lockedBy: null,
            lockedUntil: null,
            lastError: error,
          },
    )
    .where(and(eq(jobs.id, job.id), eq(jobs.lockedBy, workerId), eq(jobs.status, 'running')))
    .returning({ id: jobs.id });
  if (rows.length === 0) return 'lost';
  return exhausted ? 'failed' : 'retry';
}

/** Dời job sang thời điểm khác mà không tính là một lần thử (vd. hết hạn mức). */
export async function deferJob(db: Db, jobId: string, workerId: string, runAfter: Date, reason: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({
      status: 'queued',
      runAfter,
      attempts: sql`greatest(${jobs.attempts} - 1, 0)`,
      lockedBy: null,
      lockedUntil: null,
      lastError: reason,
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, 'running')))
    .returning({ id: jobs.id });
  return rows.length > 0;
}

/**
 * Trả job hết hạn giữ chỗ về hàng đợi (worker chết giữa chừng).
 * Job đã hết lượt thử thì chuyển failed; trả về các job bị failed để caller cập nhật video.
 */
export async function recoverExpiredJobs(db: Db): Promise<{ requeued: number; failed: Job[] }> {
  const expired = and(eq(jobs.status, 'running'), lt(jobs.lockedUntil, sql`now()`));
  const failed = await db
    .update(jobs)
    .set({ status: 'failed', finishedAt: sql`now()`, lockedBy: null, lockedUntil: null, lastError: 'hết hạn giữ chỗ và hết lượt thử' })
    .where(and(expired, sql`${jobs.attempts} >= ${jobs.maxAttempts}`))
    .returning();
  const requeued = await db
    .update(jobs)
    .set({ status: 'queued', lockedBy: null, lockedUntil: null, lastError: 'hết hạn giữ chỗ, đưa lại hàng đợi' })
    .where(expired)
    .returning({ id: jobs.id });
  return { requeued: requeued.length, failed };
}

/** 00:00 UTC ngày hôm sau — lúc hạn mức Cloudflare reset. */
export function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
