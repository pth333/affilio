import type { FastifyPluginAsync } from 'fastify';
import { templateController } from '#src/controllers/template.controller.ts';

/** Định dạng kịch bản (template) để màn tạo video chọn. */
export const templateRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', templateController.list);
};
