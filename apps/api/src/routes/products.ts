import type { FastifyPluginAsync } from 'fastify';
import { productController } from '#src/controllers/product.controller.ts';

/** Chỉ khai báo đường dẫn → controller. Validate, nghiệp vụ và truy vấn nằm ở các tầng dưới. */
export const productRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', productController.list);
  app.post('/', productController.create);
};
