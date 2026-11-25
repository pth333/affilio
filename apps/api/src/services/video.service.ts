import {
  editScene,
  findTemplate,
  requestDraft,
  requestSceneRevision,
  reviewVideo,
  startRenderFinalWorkflow,
  type Db,
  type ReviewDecision,
  type SceneWriteFailure,
  type TemporalClient,
} from '@affilio/core';
import {
  findOwnedVersion,
  findVersionBundle,
  findVideoWithProduct,
  insertReviewNote,
  listVideos,
  type ReviewNote,
  type VersionBundle,
  type Video,
  type VideoListItem,
  type VideoWithProduct,
} from '#src/repositories/video.repository.ts';
import type { AddReviewNoteInput, VideoListQuery } from '#src/schemas.ts';
import { badRequest, conflict, notFound, toPage, type Page } from '#src/shared.ts';

/**
 * Tầng nghiệp vụ của video. Nhận tham số đã validate từ controller, phối hợp repository với
 * các quy tắc nghiệp vụ trong @affilio/core (máy trạng thái, duyệt, workflow Temporal), ném AppError khi
 * vi phạm quy tắc. Không biết gì về HTTP.
 */

export type VideoDetail = VideoWithProduct & VersionBundle;

export interface ListVideosParams extends VideoListQuery {
  workspaceId: string;
}

export async function listVideoPage(db: Db, params: ListVideosParams): Promise<Page<VideoListItem>> {
  const { workspaceId, limit, cursor, status } = params;
  const rows = await listVideos(db, { workspaceId, limit, cursor, status });
  return toPage(rows, limit);
}

export async function getVideoDetail(
  db: Db,
  params: { workspaceId: string; videoId: string },
): Promise<VideoDetail> {
  const row = await findVideoWithProduct(db, params);
  if (!row) throw notFound('Không tìm thấy video');

  const versionId = row.video.currentVersionId;
  if (!versionId) return { ...row, version: null, check: null, notes: [], reviews: [] };
  return { ...row, ...(await findVersionBundle(db, versionId)) };
}

export interface DraftCreated {
  video: Video;
  workflowId: string;
}

export interface CreateDraftVideoParams {
  workspaceId: string;
  userId: string;
  productId: string;
  /** Định dạng kịch bản; bỏ trống thì dùng template mặc định. */
  templateId?: string | undefined;
}

/** Tạo video mới cho sản phẩm rồi start workflow: AI viết kịch bản và dựng nháp luôn, không dừng chờ duyệt kịch bản. */
export async function createDraftVideo(db: Db, temporal: TemporalClient, params: CreateDraftVideoParams): Promise<DraftCreated> {
  const template = await resolveTemplate(db, params.workspaceId, params.templateId);

  const result = await requestDraft(db, temporal, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    productId: params.productId,
    ...(template ? { template } : {}),
  });
  if (!result.ok) throw notFound(result.message);
  return { video: result.video, workflowId: result.workflowId };
}

/** Template ghi vào video/kịch bản; không chọn thì trả undefined để dùng định dạng mặc định. */
export async function resolveTemplate(
  db: Db,
  workspaceId: string,
  templateId: string | undefined,
): Promise<{ id: string; version: number } | undefined> {
  if (!templateId) return undefined;

  const row = await findTemplate(db, { templateId, workspaceId });
  if (!row) throw notFound('Không tìm thấy template');
  return { id: row.id, version: row.version };
}

/** Đổi lỗi ghi cảnh của core thành HTTP: không thấy → 404, dữ liệu sai → 400, còn lại 409. */
function sceneWriteError(reason: SceneWriteFailure, message: string) {
  if (reason === 'not_found' || reason === 'scene_not_found') return notFound(message);
  if (reason === 'invalid') return badRequest(message);
  return conflict(message);
}

export interface EditVideoSceneParams {
  workspaceId: string;
  userId: string;
  videoId: string;
  sceneId: string;
  versionId: string;
  narration: string;
}

/** Người duyệt sửa tay lời thoại một cảnh; video vẫn nằm trong hộp duyệt. */
export async function editVideoScene(db: Db, params: EditVideoSceneParams): Promise<{ versionId: string; versionNo: number }> {
  const result = await editScene(db, params);
  if (!result.ok) throw sceneWriteError(result.reason, result.message);
  return { versionId: result.versionId, versionNo: result.versionNo };
}

export interface ReviseVideoSceneParams {
  workspaceId: string;
  userId: string;
  videoId: string;
  sceneId: string;
  versionId: string;
  instruction?: string | undefined;
}

/** Nhờ AI viết lại một cảnh; worker sẽ đưa video quay lại hộp duyệt. */
export async function requestVideoSceneRevision(
  db: Db,
  temporal: TemporalClient,
  params: ReviseVideoSceneParams,
): Promise<{ workflowId: string }> {
  const result = await requestSceneRevision(db, temporal, params);
  if (!result.ok) throw sceneWriteError(result.reason, result.message);
  return { workflowId: result.workflowId };
}

export interface SubmitReviewParams {
  workspaceId: string;
  userId: string;
  videoId: string;
  versionId: string;
  decision: ReviewDecision;
}

/** Duyệt video; duyệt xong thì start workflow render bản cuối (idempotent theo phiên bản). */
export async function submitReview(db: Db, temporal: TemporalClient, params: SubmitReviewParams): Promise<Video> {
  const result = await reviewVideo(db, params);
  if (!result.ok) {
    // Chưa có video → 404; sai trạng thái hoặc phiên bản cũ → 409 (client tải lại rồi thử lại).
    throw result.reason === 'not_found' ? notFound(result.message) : conflict(result.message);
  }
  if (params.decision === 'approve') {
    await startRenderFinalWorkflow(temporal, { workspaceId: params.workspaceId, videoId: params.videoId, versionId: params.versionId });
  }
  return result.video;
}

export interface AddSceneNoteParams {
  workspaceId: string;
  userId: string;
  videoId: string;
  input: AddReviewNoteInput;
}

/** Ghi chú theo cảnh: chỉ cho cảnh có thật trong phiên bản đang xem của đúng video. */
export async function addSceneNote(db: Db, params: AddSceneNoteParams): Promise<ReviewNote> {
  const { versionId, sceneId, text } = params.input;
  const version = await findOwnedVersion(db, { workspaceId: params.workspaceId, videoId: params.videoId, versionId });
  if (!version) throw notFound('Không tìm thấy phiên bản video');
  if (!version.spec.scenes.some((scene) => scene.id === sceneId)) throw badRequest(`Không có cảnh ${sceneId}`);

  return insertReviewNote(db, { videoVersionId: versionId, sceneId, userId: params.userId, text });
}
