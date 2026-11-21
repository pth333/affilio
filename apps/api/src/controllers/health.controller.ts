import type { FastifyReply, FastifyRequest } from 'fastify';
import { checkReadiness } from '#src/services/health.service.ts';

/**
 * Tầng controller của healthcheck: không có dữ liệu đầu vào cần validate, chỉ hỏi service.
 */
export const healthController = {
  async health(_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.send({ status: 'ok' });
  },

  async ready(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { ready, error } = await checkReadiness(req.server.deps.handle);
    if (ready) return reply.send({ status: 'ready' });
    req.log.warn({ err: error }, 'DB chưa sẵn sàng');
    return reply.status(503).send({ status: 'not_ready' });
  },
};
