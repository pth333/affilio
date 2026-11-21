import type { FastifyReply, FastifyRequest } from 'fastify';
import { addReviewNoteSchema, createVideoSchema, idParamsSchema, reviewVideoSchema, videoListQuerySchema } from '#src/schemas.ts';
import { addSceneNote, createDraftVideo, getVideoDetail, listVideoPage, submitReview } from '#src/services/video.service.ts';
import { validate } from '#src/shared.ts';

/**
 * Tầng controller của video: nhận request, validate đầu vào, gọi service và trả response.
 * Không truy vấn DB, không chứa nghiệp vụ.
 */
export const videoController = {
  /** Hộp duyệt: danh sách video, lọc theo trạng thái. */
  async list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = validate(videoListQuerySchema, req.query);
    const { db, session } = req.server.deps;
    const page = await listVideoPage(db, { workspaceId: session.workspaceId, ...query });
    return reply.send(page);
  },

  async detail(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const { db, session } = req.server.deps;
    const detail = await getVideoDetail(db, { workspaceId: session.workspaceId, videoId: id });
    return reply.send(detail);
  },

  async create(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { productId } = validate(createVideoSchema, req.body);
    const { db, session } = req.server.deps;
    const created = await createDraftVideo(db, { workspaceId: session.workspaceId, userId: session.userId, productId });
    req.log.info({ videoId: created.video.id, jobId: created.jobId }, 'đã xếp job viết nháp');
    return reply.status(202).send(created);
  },

  async review(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const body = validate(reviewVideoSchema, req.body);
    const { db, session } = req.server.deps;
    const video = await submitReview(db, { workspaceId: session.workspaceId, videoId: id, userId: session.userId, ...body });
    return reply.send(video);
  },

  async addNote(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const input = validate(addReviewNoteSchema, req.body);
    const { db, session } = req.server.deps;
    const note = await addSceneNote(db, { workspaceId: session.workspaceId, videoId: id, userId: session.userId, input });
    return reply.status(201).send(note);
  },
};
