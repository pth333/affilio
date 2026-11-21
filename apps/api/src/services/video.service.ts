import { requestDraft, requestFinalRender, reviewVideo, type Db, type ReviewDecision } from '@vm/core';
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
 * các quy tắc nghiệp vụ trong @vm/core (máy trạng thái, duyệt, hàng đợi), ném AppError khi
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
  jobId: string;
}

/** Tạo video mới cho sản phẩm và xếp job viết nháp (nghiệp vụ nằm ở @vm/core). */
export async function createDraftVideo(
  db: Db,
  params: { workspaceId: string; userId: string; productId: string },
): Promise<DraftCreated> {
  const result = await requestDraft(db, params);
  if (!result.ok) throw notFound(result.message);
  return { video: result.video, jobId: result.job.id };
}

export interface SubmitReviewParams {
  workspaceId: string;
  userId: string;
  videoId: string;
  versionId: string;
  decision: ReviewDecision;
}

/** Duyệt video; duyệt xong thì xếp job render bản cuối (idempotent theo phiên bản). */
export async function submitReview(db: Db, params: SubmitReviewParams): Promise<Video> {
  const result = await reviewVideo(db, params);
  if (!result.ok) {
    // Chưa có video → 404; sai trạng thái hoặc phiên bản cũ → 409 (client tải lại rồi thử lại).
    throw result.reason === 'not_found' ? notFound(result.message) : conflict(result.message);
  }
  if (params.decision === 'approve') {
    await requestFinalRender(db, { workspaceId: params.workspaceId, videoId: params.videoId, versionId: params.versionId });
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
