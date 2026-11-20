import { parseArgs } from 'node:util';
import {
  and,
  count,
  createDb,
  desc,
  enqueue,
  ensureDefaultWorkspace,
  eq,
  JOB_TYPES,
  jobs,
  loadConfig,
  newId,
  product,
  requestDraft,
  REVIEW_DECISIONS,
  reviewVideo,
  video,
  VIDEO_STATUSES,
  videoCheck,
  videoVersion,
  type Db,
  type DefaultContext,
} from '@vm/core';
import { z } from 'zod';

/**
 * CLI `vm` — thao tác trực tiếp trên DB (cùng nghiệp vụ với API), dùng khi chưa có UI hoặc để debug.
 * Chạy: pnpm cli <lệnh> [tham số]
 */

const HELP = `Cách dùng: pnpm cli <lệnh> [tham số]

  product:add --name <tên> --url <link affiliate> [--desc <mô tả>] [--category <danh mục>]
  product:list
  draft <productId>                 tạo video mới và xếp job viết nháp
  list [--status <trạng thái>]      liệt kê video
  show <videoId>                    xem chi tiết video + spec hiện tại
  review <videoId> <approve|reject|needs_changes>
  jobs [--status <trạng thái>]      xem hàng đợi job
`;

type Command = (ctx: { db: Db; session: DefaultContext; positionals: string[]; values: Values }) => Promise<void>;
type Values = Record<string, string | boolean | undefined>;

function str(values: Values, key: string): string | undefined {
  const v = values[key];
  return typeof v === 'string' ? v : undefined;
}

function required(value: string | undefined, label: string): string {
  if (!value) throw usageError(`thiếu ${label}`);
  return value;
}

/** Đánh dấu lỗi do người dùng nhập sai — in thông báo ngắn thay vì stack trace. */
const USAGE = Symbol('usage');

function usageError(message: string): Error {
  return new Error(message, { cause: USAGE });
}

const productInput = z.object({
  name: z.string().trim().min(1).max(200),
  affiliateUrl: z.url({ protocol: /^https?$/ }),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(100).optional(),
});

const COMMANDS: Record<string, Command> = {
  async 'product:add'({ db, session, values }) {
    const input = productInput.parse({
      name: str(values, 'name'),
      affiliateUrl: str(values, 'url'),
      description: str(values, 'desc'),
      category: str(values, 'category'),
    });
    const [row] = await db
      .insert(product)
      .values({ id: newId('product'), workspaceId: session.workspaceId, ...input })
      .returning({ id: product.id, name: product.name });
    console.log(`Đã thêm sản phẩm ${row?.id} — ${row?.name}`);
  },

  async 'product:list'({ db, session }) {
    const rows = await db
      .select({ id: product.id, name: product.name, category: product.category, createdAt: product.createdAt })
      .from(product)
      .where(eq(product.workspaceId, session.workspaceId))
      .orderBy(desc(product.id))
      .limit(50);
    console.table(rows);
  },

  async draft({ db, session, positionals }) {
    const productId = required(positionals[0], 'productId');
    const result = await requestDraft(db, { workspaceId: session.workspaceId, productId, userId: session.userId });
    if (!result.ok) throw usageError(result.message);
    console.log(`Đã tạo video ${result.video.id}, job ${result.job.id} (chạy worker để xử lý)`);
  },

  async list({ db, session, values }) {
    const status = z.enum(VIDEO_STATUSES).optional().parse(str(values, 'status'));
    const rows = await db
      .select({ id: video.id, status: video.status, product: product.name, failed: video.failedReason, updatedAt: video.updatedAt })
      .from(video)
      .innerJoin(product, eq(product.id, video.productId))
      .where(and(eq(video.workspaceId, session.workspaceId), status ? eq(video.status, status) : undefined))
      .orderBy(desc(video.id))
      .limit(50);
    console.table(rows);
  },

  async show({ db, session, positionals }) {
    const videoId = required(positionals[0], 'videoId');
    const [v] = await db
      .select()
      .from(video)
      .where(and(eq(video.id, videoId), eq(video.workspaceId, session.workspaceId)));
    if (!v) throw usageError('không tìm thấy video');
    const [version, check] = await Promise.all([
      v.currentVersionId ? db.select().from(videoVersion).where(eq(videoVersion.id, v.currentVersionId)) : Promise.resolve([]),
      v.currentVersionId
        ? db.select().from(videoCheck).where(eq(videoCheck.videoVersionId, v.currentVersionId)).orderBy(desc(videoCheck.createdAt)).limit(1)
        : Promise.resolve([]),
    ]);
    console.log(JSON.stringify({ video: v, version: version[0] ?? null, check: check[0] ?? null }, null, 2));
  },

  async review({ db, session, positionals }) {
    const videoId = required(positionals[0], 'videoId');
    const decision = z.enum(REVIEW_DECISIONS).parse(positionals[1]);
    const [v] = await db
      .select({ currentVersionId: video.currentVersionId })
      .from(video)
      .where(and(eq(video.id, videoId), eq(video.workspaceId, session.workspaceId)));
    if (!v?.currentVersionId) throw usageError('video không tồn tại hoặc chưa có phiên bản');
    const result = await reviewVideo(db, { workspaceId: session.workspaceId, videoId, userId: session.userId, versionId: v.currentVersionId, decision });
    if (!result.ok) throw usageError(result.message);
    if (decision === 'approve') {
      await enqueue(db, {
        workspaceId: session.workspaceId,
        queue: 'render',
        type: JOB_TYPES.renderFinal,
        payload: { videoId, versionId: v.currentVersionId },
        videoId,
        idempotencyKey: `${JOB_TYPES.renderFinal}:${v.currentVersionId}`,
      });
    }
    console.log(`Video ${videoId} → ${result.video.status}`);
  },

  async jobs({ db, session, values }) {
    const status = str(values, 'status');
    const [rows, summary] = await Promise.all([
      db
        .select({ id: jobs.id, queue: jobs.queue, type: jobs.type, status: jobs.status, attempts: jobs.attempts, runAfter: jobs.runAfter, lastError: jobs.lastError })
        .from(jobs)
        .where(and(eq(jobs.workspaceId, session.workspaceId), status ? eq(jobs.status, z.enum(['queued', 'running', 'done', 'failed', 'cancelled']).parse(status)) : undefined))
        .orderBy(desc(jobs.id))
        .limit(30),
      db.select({ queue: jobs.queue, status: jobs.status, n: count() }).from(jobs).where(eq(jobs.workspaceId, session.workspaceId)).groupBy(jobs.queue, jobs.status),
    ]);
    console.table(summary);
    console.table(rows);
  },
};

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      url: { type: 'string' },
      desc: { type: 'string' },
      category: { type: 'string' },
      status: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [name, ...rest] = positionals;
  const command = name ? COMMANDS[name] : undefined;
  if (!command || values.help) {
    console.log(HELP);
    return command || values.help ? 0 : 1;
  }

  const config = loadConfig();
  const handle = createDb(config.DATABASE_URL, { max: 2, appName: 'vm-cli' });
  try {
    const session = await ensureDefaultWorkspace(handle.db, { workspaceName: config.SEED_WORKSPACE_NAME, userEmail: config.SEED_USER_EMAIL });
    await command({ db: handle.db, session, positionals: rest, values });
    return 0;
  } catch (err) {
    if (err instanceof Error && err.cause === USAGE) {
      console.error(`Lỗi: ${err.message}`);
      return 1;
    }
    if (err instanceof z.ZodError) {
      console.error(`Tham số không hợp lệ:\n${z.prettifyError(err)}`);
      return 1;
    }
    throw err;
  } finally {
    await handle.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  },
);
