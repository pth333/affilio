import type { FastifyPluginAsync } from 'fastify';
import { videoController } from '#src/controllers/video.controller.ts';

/** Chỉ khai báo đường dẫn → controller. Validate, nghiệp vụ và truy vấn nằm ở các tầng dưới. */
export const videoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', videoController.list);
  app.get('/:id', videoController.detail);
  app.post('/', videoController.create);
  app.post('/:id/review', videoController.review);
  app.post('/:id/notes', videoController.addNote);
  app.patch('/:id/scenes/:sceneId', videoController.updateScene);
  app.post('/:id/scenes/:sceneId/revise', videoController.reviseScene);
};
