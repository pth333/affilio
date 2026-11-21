import { and, desc, eq, lt, newId, product, review, reviewNote, video, videoCheck, videoVersion } from '@vm/core';
import type { Executor, VideoStatus, VideoSpec } from '@vm/core';
import type { Product } from '#src/repositories/product.repository.ts';

/**
 * Tầng repository của video: chỉ truy vấn DB, không chứa nghiệp vụ và không biết HTTP.
 */

export type Video = typeof video.$inferSelect;
export type VideoVersion = typeof videoVersion.$inferSelect;
export type VideoCheck = typeof videoCheck.$inferSelect;
export type Review = typeof review.$inferSelect;
export type ReviewNote = typeof reviewNote.$inferSelect;

/** Dòng của danh sách video (kèm tên sản phẩm để UI không phải gọi thêm). */
export interface VideoListItem {
  id: string;
  status: VideoStatus;
  productId: string;
  productName: string;
  currentVersionId: string | null;
  approvedVersionId: string | null;
  failedReason: string | null;
  updatedAt: Date;
  createdAt: Date;
}

export interface ListVideosInput {
  workspaceId: string;
  status?: VideoStatus | undefined;
  limit: number;
  /** Id của dòng cuối trang trước. */
  cursor?: string | undefined;
}

/** Lấy `limit + 1` dòng để tầng service biết còn trang sau. */
export async function listVideos(
  db: Executor,
  { workspaceId, status, limit, cursor }: ListVideosInput,
): Promise<VideoListItem[]> {
  return db
    .select({
      id: video.id,
      status: video.status,
      productId: video.productId,
      productName: product.name,
      currentVersionId: video.currentVersionId,
      approvedVersionId: video.approvedVersionId,
      failedReason: video.failedReason,
      updatedAt: video.updatedAt,
      createdAt: video.createdAt,
    })
    .from(video)
    .innerJoin(product, eq(product.id, video.productId))
    .where(
      and(eq(video.workspaceId, workspaceId), status ? eq(video.status, status) : undefined, cursor ? lt(video.id, cursor) : undefined),
    )
    .orderBy(desc(video.id))
    .limit(limit + 1);
}

export interface VideoWithProduct {
  video: Video;
  product: Product;
}

/** Video kèm sản phẩm, chỉ trong workspace hiện tại. */
export async function findVideoWithProduct(
  db: Executor,
  { workspaceId, videoId }: { workspaceId: string; videoId: string },
): Promise<VideoWithProduct | undefined> {
  const [row] = await db
    .select({ video, product })
    .from(video)
    .innerJoin(product, eq(product.id, video.productId))
    .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)));
  return row;
}

/** Mọi dữ liệu gắn với một phiên bản: spec, lần tự kiểm tra gần nhất, ghi chú và lịch sử duyệt. */
export interface VersionBundle {
  version: VideoVersion | null;
  check: VideoCheck | null;
  notes: ReviewNote[];
  reviews: Review[];
}

export async function findVersionBundle(db: Executor, versionId: string): Promise<VersionBundle> {
  const [[version], [check], notes, reviews] = await Promise.all([
    db.select().from(videoVersion).where(eq(videoVersion.id, versionId)),
    db.select().from(videoCheck).where(eq(videoCheck.videoVersionId, versionId)).orderBy(desc(videoCheck.createdAt)).limit(1),
    db.select().from(reviewNote).where(eq(reviewNote.videoVersionId, versionId)).orderBy(reviewNote.createdAt),
    db.select().from(review).where(eq(review.videoVersionId, versionId)).orderBy(desc(review.createdAt)),
  ]);
  return { version: version ?? null, check: check ?? null, notes, reviews };
}

export interface OwnedVersion {
  id: string;
  spec: VideoSpec;
}

/** Phiên bản thuộc đúng video và workspace — dùng để chặn ghi chú chéo video. */
export async function findOwnedVersion(
  db: Executor,
  { workspaceId, videoId, versionId }: { workspaceId: string; videoId: string; versionId: string },
): Promise<OwnedVersion | undefined> {
  const [row] = await db
    .select({ id: videoVersion.id, spec: videoVersion.spec })
    .from(videoVersion)
    .innerJoin(video, eq(video.id, videoVersion.videoId))
    .where(and(eq(videoVersion.id, versionId), eq(video.id, videoId), eq(video.workspaceId, workspaceId)));
  return row;
}

export interface NewReviewNoteInput {
  videoVersionId: string;
  sceneId: string;
  userId: string;
  text: string;
}

export async function insertReviewNote(db: Executor, input: NewReviewNoteInput): Promise<ReviewNote> {
  const [row] = await db
    .insert(reviewNote)
    .values({ id: newId('reviewNote'), ...input })
    .returning();
  if (!row) throw new Error('không tạo được review_note');
  return row;
}
