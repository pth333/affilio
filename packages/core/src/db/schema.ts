import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { VideoSpec } from '#src/spec/schema.ts';

/** Quy ước: ID ULID dạng text, thời gian timestamptz (UTC), JSON là jsonb. */
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const tsz = (name: string) => timestamp(name, { withTimezone: true });

// ───────────────────────── Tài khoản ─────────────────────────

export interface WorkspaceSettings {
  autoScore?: boolean;
  autoRevise?: boolean;
  dailyBudget?: number;
  defaultVoice?: string;
}

export const workspace = pgTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'),
  settings: jsonb('settings').$type<WorkspaceSettings>().notNull().default({}),
  createdAt: createdAt(),
});

export const appUser = pgTable('app_user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  createdAt: createdAt(),
});

export const MEMBERSHIP_ROLES = ['owner', 'editor', 'reviewer'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const membership = pgTable(
  'membership',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    role: text('role', { enum: MEMBERSHIP_ROLES }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

// ───────────────────────── Sản phẩm và tài nguyên ─────────────────────────

export const product = pgTable(
  'product',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    name: text('name').notNull(),
    affiliateUrl: text('affiliate_url').notNull(),
    sourceUrl: text('source_url'),
    description: text('description'),
    category: text('category'),
    archivedAt: tsz('archived_at'),
    createdAt: createdAt(),
  },
  (t) => [index('product_ws_created_idx').on(t.workspaceId, t.createdAt)],
);

export const ASSET_KINDS = [
  'product_image',
  'ai_image',
  'ai_clip',
  'music',
  'mascot_action',
  'tts',
  'scene_clip',
  'render',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_SOURCES = ['shop', 'self', 'ai', 'library'] as const;

export interface AssetMeta {
  w?: number;
  h?: number;
  duration?: number;
  mascotId?: string;
  action?: string;
}

export const asset = pgTable(
  'asset',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    kind: text('kind', { enum: ASSET_KINDS }).notNull(),
    /** Khóa tương đối trong Storage, không lưu đường dẫn tuyệt đối. */
    storageKey: text('storage_key').notNull(),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    productId: text('product_id').references(() => product.id),
    source: text('source', { enum: ASSET_SOURCES }).notNull(),
    license: text('license'),
    cacheKey: text('cache_key'),
    prompt: text('prompt'),
    model: text('model'),
    meta: jsonb('meta').$type<AssetMeta>().notNull().default({}),
    lastUsedAt: tsz('last_used_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('asset_ws_sha_uq').on(t.workspaceId, t.sha256),
    uniqueIndex('asset_ws_cache_key_uq').on(t.workspaceId, t.cacheKey).where(sql`cache_key is not null`),
    index('asset_ws_kind_idx').on(t.workspaceId, t.kind),
    index('asset_product_idx').on(t.productId),
  ],
);

export const sceneCache = pgTable(
  'scene_cache',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    sceneHash: text('scene_hash').notNull(),
    assetId: text('asset_id')
      .notNull()
      .references(() => asset.id),
    presetVersion: integer('preset_version').notNull(),
    lastUsedAt: tsz('last_used_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.sceneHash] })],
);

// ───────────────────────── Lô (khai báo trước video vì video tham chiếu) ─────────────────────────

export const batch = pgTable(
  'batch',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    name: text('name').notNull(),
    goal: text('goal'),
    budgetNeurons: integer('budget_neurons'),
    status: text('status', { enum: ['open', 'running', 'done', 'cancelled'] })
      .notNull()
      .default('open'),
    createdAt: createdAt(),
  },
  (t) => [index('batch_ws_created_idx').on(t.workspaceId, t.createdAt)],
);

// ───────────────────────── Video, duyệt và render ─────────────────────────

export const VIDEO_STATUSES = [
  'queued',
  'drafting',
  'auto_check',
  'previewing',
  'pending_review',
  'approved',
  'rendering',
  'ready',
  'published',
  'rejected_auto',
  'rejected',
  'needs_changes',
  'revising',
  'failed',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const video = pgTable(
  'video',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    status: text('status', { enum: VIDEO_STATUSES }).notNull().default('queued'),
    currentVersionId: text('current_version_id'),
    approvedVersionId: text('approved_version_id'),
    templateId: text('template_id'),
    templateVersion: integer('template_version'),
    batchId: text('batch_id').references(() => batch.id),
    /** user_id, hoặc null nếu AI tạo. */
    createdBy: text('created_by').references(() => appUser.id),
    failedReason: text('failed_reason'),
    /** Bước bị lỗi, để nút "Chạy lại" quay về đúng bước. */
    failedStep: text('failed_step'),
    createdAt: createdAt(),
    updatedAt: tsz('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('video_ws_status_updated_idx').on(t.workspaceId, t.status, t.updatedAt),
    index('video_product_idx').on(t.productId),
  ],
);

export const VERSION_SOURCES = ['ai_draft', 'ai_revise', 'user_edit', 'restore'] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

/** Bảng chỉ thêm, không sửa. */
export const videoVersion = pgTable(
  'video_version',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    parentVersionId: text('parent_version_id'),
    spec: jsonb('spec').$type<VideoSpec>().notNull(),
    specHash: text('spec_hash').notNull(),
    source: text('source', { enum: VERSION_SOURCES }).notNull(),
    authorUserId: text('author_user_id').references(() => appUser.id),
    changeSummary: text('change_summary'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('video_version_video_no_uq').on(t.videoId, t.versionNo)],
);

export interface RuleResult {
  rule: string;
  passed: boolean;
  message?: string;
}

export const videoCheck = pgTable(
  'video_check',
  {
    id: text('id').primaryKey(),
    videoVersionId: text('video_version_id')
      .notNull()
      .references(() => videoVersion.id, { onDelete: 'cascade' }),
    rules: jsonb('rules').$type<RuleResult[]>().notNull(),
    passed: boolean('passed').notNull(),
    aiScore: real('ai_score'),
    aiFeedback: text('ai_feedback'),
    createdAt: createdAt(),
  },
  (t) => [index('video_check_version_idx').on(t.videoVersionId)],
);

export const REVIEW_DECISIONS = ['approve', 'reject', 'needs_changes'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const review = pgTable(
  'review',
  {
    id: text('id').primaryKey(),
    videoVersionId: text('video_version_id')
      .notNull()
      .references(() => videoVersion.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => appUser.id),
    decision: text('decision', { enum: REVIEW_DECISIONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('review_version_idx').on(t.videoVersionId)],
);

export const reviewNote = pgTable(
  'review_note',
  {
    id: text('id').primaryKey(),
    videoVersionId: text('video_version_id')
      .notNull()
      .references(() => videoVersion.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => appUser.id),
    text: text('text').notNull(),
    status: text('status', { enum: ['open', 'applied', 'dismissed'] })
      .notNull()
      .default('open'),
    appliedInVersionId: text('applied_in_version_id'),
    createdAt: createdAt(),
  },
  (t) => [index('review_note_version_status_idx').on(t.videoVersionId, t.status)],
);

export const render = pgTable(
  'render',
  {
    id: text('id').primaryKey(),
    videoVersionId: text('video_version_id')
      .notNull()
      .references(() => videoVersion.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['preview', 'final'] }).notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    assetId: text('asset_id').references(() => asset.id),
    presetVersion: integer('preset_version').notNull(),
    error: text('error'),
    createdAt: createdAt(),
    finishedAt: tsz('finished_at'),
  },
  (t) => [index('render_version_kind_idx').on(t.videoVersionId, t.kind)],
);

// ───────────────────────── Template ─────────────────────────

/** Một version template đã dùng thì không sửa; muốn đổi thì tạo version mới. */
export const template = pgTable(
  'template',
  {
    id: text('id').notNull(),
    version: integer('version').notNull(),
    /** null = template hệ thống dùng chung. */
    workspaceId: text('workspace_id').references(() => workspace.id),
    name: text('name').notNull(),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('draft'),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.id, t.version] }), index('template_ws_status_idx').on(t.workspaceId, t.status)],
);

export const hookTemplate = pgTable(
  'hook_template',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspace.id),
    pattern: text('pattern').notNull(),
    category: text('category'),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: createdAt(),
  },
  (t) => [index('hook_template_ws_idx').on(t.workspaceId)],
);

// ───────────────────────── Hàng đợi và lô ─────────────────────────

export const batchItem = pgTable(
  'batch_item',
  {
    batchId: text('batch_id')
      .notNull()
      .references(() => batch.id, { onDelete: 'cascade' }),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    videoId: text('video_id').references(() => video.id),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.productId] })],
);

export const JOB_QUEUES = ['llm', 'render'] as const;
export type JobQueue = (typeof JOB_QUEUES)[number];
export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    queue: text('queue', { enum: JOB_QUEUES }).notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: tsz('run_after').defaultNow().notNull(),
    lockedBy: text('locked_by'),
    lockedUntil: tsz('locked_until'),
    idempotencyKey: text('idempotency_key').unique(),
    lastError: text('last_error'),
    videoId: text('video_id').references(() => video.id),
    batchId: text('batch_id').references(() => batch.id),
    createdAt: createdAt(),
    finishedAt: tsz('finished_at'),
  },
  (t) => [
    index('jobs_claim_idx').on(t.queue, t.priority, t.runAfter).where(sql`status = 'queued'`),
    index('jobs_status_locked_idx').on(t.status, t.lockedUntil),
  ],
);

// ───────────────────────── AI và chi phí ─────────────────────────

export const AI_PURPOSES = ['idea', 'script', 'image', 'score', 'revise', 'tts', 'clip'] as const;
export type AiPurpose = (typeof AI_PURPOSES)[number];

export const aiCallLog = pgTable(
  'ai_call_log',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    jobId: text('job_id'),
    videoId: text('video_id'),
    purpose: text('purpose', { enum: AI_PURPOSES }).notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** neurons hoặc số ký tự, tuỳ provider. */
    units: numeric('units', { mode: 'number' }).notNull().default(0),
    costEstimate: numeric('cost_estimate', { mode: 'number' }),
    latencyMs: integer('latency_ms').notNull(),
    status: text('status', { enum: ['ok', 'error'] }).notNull(),
    error: text('error'),
    prompt: text('prompt'),
    output: text('output'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_call_log_ws_created_idx').on(t.workspaceId, t.createdAt),
    index('ai_call_log_video_idx').on(t.videoId),
  ],
);

export const quotaUsage = pgTable(
  'quota_usage',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    provider: text('provider').notNull(),
    /** Ngày UTC dạng YYYY-MM-DD. */
    day: text('day').notNull(),
    reserved: numeric('reserved', { mode: 'number' }).notNull().default(0),
    used: numeric('used', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider, t.day] })],
);

// ───────────────────────── Xuất bản và đo lường ─────────────────────────

export const PLATFORMS = ['tiktok', 'facebook', 'youtube', 'shopee'] as const;

export const publication = pgTable(
  'publication',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id),
    videoVersionId: text('video_version_id')
      .notNull()
      .references(() => videoVersion.id),
    platform: text('platform', { enum: PLATFORMS }).notNull(),
    account: text('account'),
    url: text('url'),
    postedAt: tsz('posted_at'),
    aiLabelOn: boolean('ai_label_on').notNull().default(false),
  },
  (t) => [
    index('publication_ws_posted_idx').on(t.workspaceId, t.postedAt),
    index('publication_video_idx').on(t.videoId),
  ],
);

export const metricSnapshot = pgTable(
  'metric_snapshot',
  {
    id: text('id').primaryKey(),
    publicationId: text('publication_id')
      .notNull()
      .references(() => publication.id, { onDelete: 'cascade' }),
    checkpoint: text('checkpoint', { enum: ['1h', '24h', '7d', 'manual'] }).notNull(),
    takenAt: tsz('taken_at').notNull(),
    views: integer('views').notNull().default(0),
    completionRate: real('completion_rate'),
    clicks: integer('clicks').notNull().default(0),
    orders: integer('orders').notNull().default(0),
    revenue: numeric('revenue', { mode: 'number' }),
  },
  (t) => [index('metric_snapshot_pub_taken_idx').on(t.publicationId, t.takenAt)],
);

export const experiment = pgTable(
  'experiment',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    hypothesis: text('hypothesis').notNull(),
    variable: text('variable').notNull(),
    status: text('status', { enum: ['running', 'done', 'cancelled'] })
      .notNull()
      .default('running'),
    conclusion: text('conclusion'),
  },
  (t) => [index('experiment_ws_idx').on(t.workspaceId)],
);

export const experimentVariant = pgTable(
  'experiment_variant',
  {
    experimentId: text('experiment_id')
      .notNull()
      .references(() => experiment.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id),
    variant: text('variant').notNull(),
  },
  (t) => [primaryKey({ columns: [t.experimentId, t.videoId] })],
);

// ───────────────────────── Hệ thống ─────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id),
    userId: text('user_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_ws_created_idx').on(t.workspaceId, t.createdAt)],
);
