import type { FastifyPluginAsync } from 'fastify';
import { healthController } from '#src/controllers/health.controller.ts';

/** Chỉ khai báo đường dẫn → controller. Healthcheck gọi liên tục nên chỉ log từ warn trở lên. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { logLevel: 'warn' }, healthController.health);
  app.get('/ready', { logLevel: 'warn' }, healthController.ready);
};
