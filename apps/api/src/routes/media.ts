import type { FastifyPluginAsync } from 'fastify';
import { mediaController } from '#src/controllers/media.controller.ts';

/** Phục vụ tệp trong Storage theo khóa (ảnh sản phẩm, clip, bản render…). */
export const mediaRoutes: FastifyPluginAsync = async (app) => {
  app.get('/media/*', mediaController.get);
};
