import type { FastifyReply, FastifyRequest } from 'fastify';
import { listTemplateItems } from '#src/services/template.service.ts';

/** Tầng controller của template: chỉ có đọc danh sách định dạng kịch bản. */
export const templateController = {
  async list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { db, session } = req.server.deps;
    const items = await listTemplateItems(db, session.workspaceId);
    return reply.send({ items });
  },
};
