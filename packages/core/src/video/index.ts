import { and, eq, inArray, max, sql } from 'drizzle-orm';
import type { Db, Executor, Tx } from '#src/db/index.ts';
import { newId } from '#src/db/id.ts';
import {
  auditLog,
  review,
  video,
  videoVersion,
  type ReviewDecision,
  type VersionSource,
  type VideoStatus,
} from '#src/db/schema.ts';
import { specHash } from '#src/spec/hash.ts';
import { applyScenePatch } from '#src/spec/patch.ts';
import type { Scene, VideoSpec } from '#src/spec/schema.ts';
import { startReviseWorkflow, type TemporalClient } from '#src/temporal/index.ts';

export type Video = typeof video.$inferSelect;
export type VideoVersion = typeof videoVersion.$inferSelect;

/** Máy trạng thái video (mục 4 plan v4). Mọi chuyển trạng thái phải nằm trong bảng này. */
export const VIDEO_TRANSITIONS: Record<VideoStatus, readonly VideoStatus[]> = {
  queued: ['drafting', 'failed'],
  drafting: ['auto_check', 'failed'],
  auto_check: ['previewing', 'rejected_auto', 'failed'],
  previewing: ['pending_review', 'failed'],
  pending_review: ['approved', 'rejected', 'needs_changes', 'pending_review'],
  approved: ['rendering', 'pending_review'],
  rendering: ['ready', 'failed'],
  ready: ['published', 'pending_review'],
  published: [],
  rejected_auto: ['revising', 'drafting'],
  rejected: [],
  needs_changes: ['revising', 'pending_review'],
  revising: ['auto_check', 'failed'],
  failed: ['queued', 'drafting', 'previewing', 'rendering'],
};

export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  return VIDEO_TRANSITIONS[from].includes(to);
}

/** Các trạng thái mà job worker đang xử lý — UI không cho sửa khi đang ở đây. */
export const BUSY_STATUSES: readonly VideoStatus[] = ['queued', 'drafting', 'auto_check', 'previewing', 'revising', 'rendering'];

export interface TransitionInput {
  videoId: string;
  to: VideoStatus;
  /** Chỉ chuyển nếu video đang ở một trong các trạng thái này (khóa lạc quan). */
  from: readonly VideoStatus[];
  set?: Partial<Pick<Video, 'failedReason' | 'failedStep' | 'currentVersionId' | 'approvedVersionId'>>;
}

/** Chuyển trạng thái có điều kiện; trả null nếu video không còn ở trạng thái mong đợi. */
export async function transitionVideo(db: Executor, { videoId, to, from, set }: TransitionInput): Promise<Video | null> {
  const allowed = from.filter((s) => canTransition(s, to));
  if (allowed.length === 0) throw new Error(`không có đường chuyển hợp lệ ${from.join('|')} → ${to}`);
  const [row] = await db
    .update(video)
    .set({ ...set, status: to, updatedAt: sql`now()` })
    .where(and(eq(video.id, videoId), inArray(video.status, allowed)))
    .returning();
  return row ?? null;
}

export async function markVideoFailed(db: Executor, videoId: string, step: string, reason: string): Promise<void> {
  await db
    .update(video)
    .set({ status: 'failed', failedStep: step, failedReason: reason.slice(0, 2000), updatedAt: sql`now()` })
    .where(and(eq(video.id, videoId), inArray(video.status, BUSY_STATUSES)));
}

// ───────────────────────── Phiên bản ─────────────────────────

export interface CreateVersionInput {
  videoId: string;
  spec: VideoSpec;
  source: VersionSource;
  authorUserId?: string | null;
  parentVersionId?: string | null;
  changeSummary?: string | null;
}

/** Thêm phiên bản mới và trỏ current_version_id vào nó. Gọi trong transaction. */
export async function createVersion(tx: Tx, input: CreateVersionInput): Promise<VideoVersion> {
  // Khóa dòng video để hai lần lưu đồng thời không lấy trùng version_no.
  await tx.select({ id: video.id }).from(video).where(eq(video.id, input.videoId)).for('update');
  const [last] = await tx
    .select({ n: max(videoVersion.versionNo) })
    .from(videoVersion)
    .where(eq(videoVersion.videoId, input.videoId));
  const [row] = await tx
    .insert(videoVersion)
    .values({
      id: newId('videoVersion'),
      videoId: input.videoId,
      versionNo: (last?.n ?? 0) + 1,
      parentVersionId: input.parentVersionId ?? null,
      spec: input.spec,
      specHash: specHash(input.spec),
      source: input.source,
      authorUserId: input.authorUserId ?? null,
      changeSummary: input.changeSummary ?? null,
    })
    .returning();
  if (!row) throw new Error('không tạo được video_version');
  await tx.update(video).set({ currentVersionId: row.id, updatedAt: sql`now()` }).where(eq(video.id, input.videoId));
  return row;
}

/** Cổng duyệt: chỉ render bản cuối khi đúng phiên bản đã được duyệt. */
export function canFinalRender(v: Pick<Video, 'status' | 'approvedVersionId' | 'currentVersionId'>): boolean {
  return v.status === 'approved' && v.approvedVersionId !== null && v.approvedVersionId === v.currentVersionId;
}

// ───────────────────────── Audit ─────────────────────────

export interface AuditInput {
  workspaceId: string;
  userId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  data?: Record<string, unknown>;
}

export async function writeAudit(db: Executor, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    id: newId('audit'),
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    data: input.data ?? {},
  });
}

// ───────────────────────── Duyệt ─────────────────────────

const DECISION_STATUS: Record<ReviewDecision, VideoStatus> = {
  approve: 'approved',
  reject: 'rejected',
  needs_changes: 'needs_changes',
};

export type ReviewOutcome =
  | { ok: true; video: Video }
  | { ok: false; reason: 'not_found' | 'not_reviewable' | 'stale_version'; message: string };

export interface ReviewInput {
  workspaceId: string;
  videoId: string;
  userId: string;
  /** Phiên bản người duyệt đang xem; khác current thì từ chối để tránh duyệt nhầm bản cũ. */
  versionId: string;
  decision: ReviewDecision;
}

export async function reviewVideo(db: Db, input: ReviewInput): Promise<ReviewOutcome> {
  return db.transaction(async (tx) => {
    const [v] = await tx
      .select()
      .from(video)
      .where(and(eq(video.id, input.videoId), eq(video.workspaceId, input.workspaceId)))
      .for('update');
    if (!v) return { ok: false, reason: 'not_found', message: 'không tìm thấy video' };
    if (v.status !== 'pending_review') {
      return { ok: false, reason: 'not_reviewable', message: `video đang ở trạng thái ${v.status}, không duyệt được` };
    }
    if (v.currentVersionId !== input.versionId) {
      return { ok: false, reason: 'stale_version', message: 'video đã có phiên bản mới hơn, tải lại để xem' };
    }

    await tx.insert(review).values({
      id: newId('review'),
      videoVersionId: input.versionId,
      userId: input.userId,
      decision: input.decision,
    });
    const updated = await transitionVideo(tx, {
      videoId: v.id,
      from: ['pending_review'],
      to: DECISION_STATUS[input.decision],
      set: { approvedVersionId: input.decision === 'approve' ? input.versionId : null },
    });
    if (!updated) return { ok: false, reason: 'not_reviewable', message: 'trạng thái video vừa thay đổi' };

    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: `video.${input.decision}`,
      targetType: 'video',
      targetId: v.id,
      data: { versionId: input.versionId },
    });
    return { ok: true, video: updated };
  });
}

// ───────────────────────── Sửa cảnh trong hộp duyệt ─────────────────────────

/** Lý do không ghi được cảnh — tầng service API đổi thành mã HTTP tương ứng. */
export type SceneWriteFailure = 'not_found' | 'not_reviewable' | 'stale_version' | 'scene_not_found' | 'locked' | 'invalid';

export interface SceneGateInput {
  workspaceId: string;
  videoId: string;
  versionId: string;
  sceneId: string;
}

interface SceneGate {
  video: Video;
  version: VideoVersion;
  scene: Scene;
}

type SceneGateResult = { ok: true; gate: SceneGate } | { ok: false; reason: SceneWriteFailure; message: string };

/** Khóa dòng video rồi kiểm tra: đúng workspace, đang chờ duyệt, đúng phiên bản đang xem, có cảnh. */
async function findReviewableScene(tx: Tx, input: SceneGateInput): Promise<SceneGateResult> {
  const [v] = await tx
    .select()
    .from(video)
    .where(and(eq(video.id, input.videoId), eq(video.workspaceId, input.workspaceId)))
    .for('update');
  if (!v) return { ok: false, reason: 'not_found', message: 'không tìm thấy video' };
  if (v.status !== 'pending_review') {
    return { ok: false, reason: 'not_reviewable', message: `video đang ở trạng thái ${v.status}, chỉ sửa được khi chờ duyệt` };
  }
  if (v.currentVersionId !== input.versionId) {
    return { ok: false, reason: 'stale_version', message: 'video đã có phiên bản mới hơn, tải lại để xem' };
  }
  const [version] = await tx.select().from(videoVersion).where(eq(videoVersion.id, input.versionId));
  if (!version) return { ok: false, reason: 'not_found', message: 'không tìm thấy phiên bản video' };
  const scene = version.spec.scenes.find((item) => item.id === input.sceneId);
  if (!scene) return { ok: false, reason: 'scene_not_found', message: `không có cảnh ${input.sceneId}` };
  return { ok: true, gate: { video: v, version, scene } };
}

export interface EditSceneInput extends SceneGateInput {
  userId: string;
  narration: string;
}

export type SceneEditResult =
  | { ok: true; versionId: string; versionNo: number }
  | { ok: false; reason: SceneWriteFailure; message: string };

/** Người dùng sửa lời thoại một cảnh: tạo phiên bản mới và giữ video trong hộp duyệt. */
export async function editScene(db: Db, input: EditSceneInput): Promise<SceneEditResult> {
  return db.transaction(async (tx) => {
    const found = await findReviewableScene(tx, input);
    if (!found.ok) return found;
    const { gate } = found;

    const patched = applyScenePatch(
      gate.version.spec,
      { ops: [{ op: 'update', sceneId: input.sceneId, changes: { narration: input.narration } }] },
      { kind: 'user' },
    );
    if (!patched.ok) return { ok: false, reason: 'invalid', message: patched.errors.join('; ') };

    const version = await createVersion(tx, {
      videoId: gate.video.id,
      spec: patched.value,
      source: 'user_edit',
      authorUserId: input.userId,
      parentVersionId: input.versionId,
      changeSummary: `người dùng sửa cảnh ${input.sceneId}`,
    });
    // Ở lại hộp duyệt với phiên bản mới; người duyệt quyết định trên bản này.
    await transitionVideo(tx, { videoId: gate.video.id, from: ['pending_review'], to: 'pending_review' });
    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: 'video.scene_edit',
      targetType: 'video',
      targetId: gate.video.id,
      data: { versionId: input.versionId, sceneId: input.sceneId, newVersionId: version.id },
    });
    return { ok: true, versionId: version.id, versionNo: version.versionNo };
  });
}

export interface ReviseSceneInput extends SceneGateInput {
  userId: string;
  instruction?: string | undefined;
}

export type SceneReviseResult =
  | { ok: true; workflowId: string }
  | { ok: false; reason: SceneWriteFailure; message: string };

/**
 * Nhờ AI sửa một cảnh: chuyển sang needs_changes rồi start workflow sửa cảnh trên Temporal.
 * Start sau khi commit (worker phải thấy trạng thái mới); start lỗi thì trả video về hộp duyệt
 * để không treo ở `needs_changes` và người dùng thử lại được.
 */
export async function requestSceneRevision(db: Db, temporal: TemporalClient, input: ReviseSceneInput): Promise<SceneReviseResult> {
  const gated = await db.transaction(async (tx): Promise<{ ok: true } | { ok: false; reason: SceneWriteFailure; message: string }> => {
    const found = await findReviewableScene(tx, input);
    if (!found.ok) return found;
    const { gate } = found;
    if (gate.scene.lock !== null) {
      return { ok: false, reason: 'locked', message: `cảnh ${input.sceneId} đã khóa do sửa tay, bỏ khóa trước khi nhờ AI` };
    }

    const moved = await transitionVideo(tx, { videoId: gate.video.id, from: ['pending_review'], to: 'needs_changes' });
    if (!moved) return { ok: false, reason: 'not_reviewable', message: 'trạng thái video vừa thay đổi, tải lại để xem' };

    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: 'video.scene_revise',
      targetType: 'video',
      targetId: gate.video.id,
      data: { versionId: input.versionId, sceneId: input.sceneId },
    });
    return { ok: true };
  });
  if (!gated.ok) return gated;

  try {
    const { workflowId } = await startReviseWorkflow(temporal, {
      workspaceId: input.workspaceId,
      videoId: input.videoId,
      versionId: input.versionId,
      sceneId: input.sceneId,
      instruction: input.instruction ?? null,
    });
    return { ok: true, workflowId };
  } catch (err) {
    await transitionVideo(db, { videoId: input.videoId, from: ['needs_changes'], to: 'pending_review' });
    throw new Error(`không start được workflow sửa cảnh cho video ${input.videoId}`, { cause: err });
  }
}

export * from '#src/video/draft.ts';
