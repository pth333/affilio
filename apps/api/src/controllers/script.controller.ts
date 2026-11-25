import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createAiScriptsSchema,
  createManualScriptSchema,
  createVideoFromScriptSchema,
  idParamsSchema,
  scriptListQuerySchema,
  updateScriptSchema,
} from '#src/schemas.ts';
import {
  archive,
  createManual,
  createVideo,
  getScriptDetail,
  listScriptPage,
  regenerate,
  requestAiScriptBatch,
  saveScript,
} from '#src/services/script.service.ts';
import { validate } from '#src/shared.ts';

/**
 * Tầng controller của thư viện kịch bản: nhận request, validate đầu vào, gọi service và trả response.
 */
export const scriptController = {
  async list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = validate(scriptListQuerySchema, req.query);
    const { db, session } = req.server.deps;
    const page = await listScriptPage(db, { workspaceId: session.workspaceId, ...query });
    return reply.status(200).send(page);
  },

  async detail(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const { db, session } = req.server.deps;
    const detail = await getScriptDetail(db, { workspaceId: session.workspaceId, scriptId: id });
    return reply.status(200).send(detail);
  },

  /** Giao worker AI viết kịch bản cho nhiều sản phẩm; trả 202 ngay, người dùng làm việc khác trong lúc chờ. */
  async requestAi(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = validate(createAiScriptsSchema, req.body);
    const { db, temporal, session } = req.server.deps;
    const created = await requestAiScriptBatch(db, temporal, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      ...body,
    });
    req.log.info({ scriptIds: created.items.map((i) => i.script.id), templateId: body.templateId }, 'đã giao worker viết kịch bản');
    return reply.status(202).send(created);
  },

  /** Người dùng tự viết kịch bản (không gọi AI). */
  async create(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = validate(createManualScriptSchema, req.body);
    const { db, session } = req.server.deps;
    const script = await createManual(db, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      productId: body.productId,
      templateId: body.templateId,
      narrations: body.scenes.map((s) => s.narration),
    });
    return reply.status(201).send(script);
  },

  /** Sửa lời thoại; 409 nếu đã có phiên bản mới hơn bản người dùng đang xem. */
  async update(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const body = validate(updateScriptSchema, req.body);
    const { db, session } = req.server.deps;
    const result = await saveScript(db, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      scriptId: id,
      versionId: body.versionId,
      narrations: body.scenes.map((s) => s.narration),
    });
    return reply.status(200).send(result);
  },

  /** AI viết lại toàn bộ kịch bản. */
  async regenerate(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const { db, temporal, session } = req.server.deps;
    const result = await regenerate(db, temporal, { workspaceId: session.workspaceId, userId: session.userId, scriptId: id });
    req.log.info({ scriptId: id, workflowId: result.workflowId }, 'đã giao worker viết lại kịch bản');
    return reply.status(202).send(result);
  },

  async archive(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const { db, session } = req.server.deps;
    const script = await archive(db, { workspaceId: session.workspaceId, userId: session.userId, scriptId: id });
    return reply.status(200).send(script);
  },

  /** Tạo video từ phiên bản kịch bản đang xem → worker dựng preview (không gọi AI). */
  async createVideo(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const body = validate(createVideoFromScriptSchema, req.body);
    const { db, temporal, session } = req.server.deps;
    const result = await createVideo(db, temporal, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      scriptId: id,
      versionId: body.versionId,
    });
    req.log.info({ scriptId: id, videoId: result.video.id, workflowId: result.workflowId }, 'đã tạo video từ kịch bản');
    return reply.status(202).send(result);
  },
};
