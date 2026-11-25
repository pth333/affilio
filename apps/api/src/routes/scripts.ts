import type { FastifyPluginAsync } from 'fastify';
import { scriptController } from '#src/controllers/script.controller.ts';

/** Thư viện kịch bản. Chỉ khai báo đường dẫn → controller. */
export const scriptRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', scriptController.list);
  // Khai báo trước '/:id' để `ai` không bị hiểu là id kịch bản.
  app.post('/ai', scriptController.requestAi);
  app.post('/', scriptController.create);
  app.get('/:id', scriptController.detail);
  app.put('/:id', scriptController.update);
  app.post('/:id/regenerate', scriptController.regenerate);
  app.post('/:id/archive', scriptController.archive);
  app.post('/:id/videos', scriptController.createVideo);
};
