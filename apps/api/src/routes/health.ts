import { pingDb } from '@vm/core';
import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Healthcheck gọi liên tục → chỉ log khi warn trở lên.
  app.get('/health', { logLevel: 'warn' }, async () => ({ status: 'ok' }));

  app.get('/ready', { logLevel: 'warn' }, async (req, reply) => {
    try {
      await pingDb(app.deps.handle);
      return { status: 'ready' };
    } catch (err) {
      req.log.warn({ err }, 'DB chưa sẵn sàng');
      return reply.status(503).send({ status: 'not_ready' });
    }
  });
};
