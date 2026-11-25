import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  addReviewNoteSchema,
  createVideoSchema,
  idParamsSchema,
  reviseSceneSchema,
  reviewVideoSchema,
  sceneParamsSchema,
  updateSceneSchema,
  videoListQuerySchema,
} from '#src/schemas.ts';
import {
  addSceneNote,
  createDraftVideo,
  editVideoScene,
  getVideoDetail,
  listVideoPage,
  requestVideoSceneRevision,
  submitReview,
} from '#src/services/video.service.ts';
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
    return reply.status(200).send(page);
  },

  async detail(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const { db, session } = req.server.deps;
    const detail = await getVideoDetail(db, { workspaceId: session.workspaceId, videoId: id });
    return reply.status(200).send(detail);
  },

  async create(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = validate(createVideoSchema, req.body);
    const { db, temporal, session } = req.server.deps;
    const created = await createDraftVideo(db, temporal, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      productId: body.productId,
      templateId: body.templateId,
    });
    req.log.info({ videoId: created.video.id, workflowId: created.workflowId }, 'đã start workflow cho video');
    return reply.status(202).send(created);
  },

  async review(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const body = validate(reviewVideoSchema, req.body);
    const { db, temporal, session } = req.server.deps;
    const video = await submitReview(db, temporal, { workspaceId: session.workspaceId, videoId: id, userId: session.userId, ...body });
    return reply.status(200).send(video);
  },

  async addNote(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const input = validate(addReviewNoteSchema, req.body);
    const { db, session } = req.server.deps;
    const note = await addSceneNote(db, { workspaceId: session.workspaceId, videoId: id, userId: session.userId, input });
    return reply.status(201).send(note);
  },

  /** Người duyệt sửa tay lời thoại một cảnh. */
  async updateScene(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id, sceneId } = validate(sceneParamsSchema, req.params);
    const body = validate(updateSceneSchema, req.body);
    const { db, session } = req.server.deps;
    const result = await editVideoScene(db, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      videoId: id,
      sceneId,
      ...body,
    });
    req.log.info({ videoId: id, sceneId, versionId: result.versionId }, 'người dùng sửa cảnh');
    return reply.status(200).send(result);
  },

  /** Nhờ AI viết lại một cảnh; workflow trên worker xử lý rồi đưa video về hộp duyệt. */
  async reviseScene(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id, sceneId } = validate(sceneParamsSchema, req.params);
    const body = validate(reviseSceneSchema, req.body);
    const { db, temporal, session } = req.server.deps;
    const result = await requestVideoSceneRevision(db, temporal, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      videoId: id,
      sceneId,
      ...body,
    });
    req.log.info({ videoId: id, sceneId, workflowId: result.workflowId }, 'đã start workflow AI sửa cảnh');
    return reply.status(202).send(result);
  },
};
