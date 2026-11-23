import {
  and,
  desc,
  eq,
  lt,
  newId,
  product,
  requestDraft,
  REVIEW_DECISIONS,
  review,
  reviewNote,
  reviewVideo,
  startRenderFinalWorkflow,
  video,
  VIDEO_STATUSES,
  videoCheck,
  videoVersion,
} from '@vm/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nextCursor, pageQuerySchema } from '#src/routes/pagination.ts';

const idParams = z.object({ id: z.string().min(1).max(64) });
const listQuery = pageQuerySchema.extend({ status: z.enum(VIDEO_STATUSES).optional() });
const createSchema = z.object({ productId: z.string().min(1).max(64) });
const reviewSchema = z.object({ versionId: z.string().min(1).max(64), decision: z.enum(REVIEW_DECISIONS) });
const noteSchema = z.object({
  versionId: z.string().min(1).max(64),
  sceneId: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(2000),
});

export const videoRoutes: FastifyPluginAsync = async (app) => {
  const { db, session, temporal } = app.deps;

  /** Hộp duyệt: danh sách video, lọc theo trạng thái. */
  app.get('/', async (req) => {
    const { limit, cursor, status } = listQuery.parse(req.query);
    const rows = await db
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
      .where(and(eq(video.workspaceId, session.workspaceId), status ? eq(video.status, status) : undefined, cursor ? lt(video.id, cursor) : undefined))
      .orderBy(desc(video.id))
      .limit(limit + 1);
    return nextCursor(rows, limit);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const [row] = await db
      .select({ video, product })
      .from(video)
      .innerJoin(product, eq(product.id, video.productId))
      .where(and(eq(video.id, id), eq(video.workspaceId, session.workspaceId)));
    if (!row) return reply.notFound('Không tìm thấy video');

    const versionId = row.video.currentVersionId;
    if (!versionId) return { ...row, version: null, check: null, notes: [], reviews: [] };

    const [[version], [check], notes, reviews] = await Promise.all([
      db.select().from(videoVersion).where(eq(videoVersion.id, versionId)),
      db.select().from(videoCheck).where(eq(videoCheck.videoVersionId, versionId)).orderBy(desc(videoCheck.createdAt)).limit(1),
      db.select().from(reviewNote).where(eq(reviewNote.videoVersionId, versionId)).orderBy(reviewNote.createdAt),
      db.select().from(review).where(eq(review.videoVersionId, versionId)).orderBy(desc(review.createdAt)),
    ]);
    return { ...row, version: version ?? null, check: check ?? null, notes, reviews };
  });

  app.post('/', async (req, reply) => {
    const { productId } = createSchema.parse(req.body);
    const result = await requestDraft(db, temporal, { workspaceId: session.workspaceId, productId, userId: session.userId });
    if (!result.ok) return reply.notFound(result.message);
    req.log.info({ videoId: result.video.id, workflowId: result.workflowId }, 'đã start workflow viết nháp');
    return reply.status(202).send({ video: result.video, workflowId: result.workflowId });
  });

  app.post('/:id/review', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = reviewSchema.parse(req.body);
    const result = await reviewVideo(db, { workspaceId: session.workspaceId, videoId: id, userId: session.userId, ...body });
    if (!result.ok) {
      return result.reason === 'not_found' ? reply.notFound(result.message) : reply.conflict(result.message);
    }
    if (body.decision === 'approve') {
      // Idempotent theo phiên bản (workflow ID): duyệt lại cùng bản không render hai lần.
      await startRenderFinalWorkflow(temporal, { workspaceId: session.workspaceId, videoId: id, versionId: body.versionId });
    }
    return result.video;
  });

  app.post('/:id/notes', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = noteSchema.parse(req.body);
    const [owned] = await db
      .select({ id: videoVersion.id, spec: videoVersion.spec })
      .from(videoVersion)
      .innerJoin(video, eq(video.id, videoVersion.videoId))
      .where(and(eq(videoVersion.id, body.versionId), eq(video.id, id), eq(video.workspaceId, session.workspaceId)));
    if (!owned) return reply.notFound('Không tìm thấy phiên bản video');
    if (!owned.spec.scenes.some((s) => s.id === body.sceneId)) return reply.badRequest(`Không có cảnh ${body.sceneId}`);

    const [note] = await db
      .insert(reviewNote)
      .values({ id: newId('reviewNote'), videoVersionId: body.versionId, sceneId: body.sceneId, userId: session.userId, text: body.text })
      .returning();
    return reply.status(201).send(note);
  });
};
