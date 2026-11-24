import type { FastifyPluginAsync } from 'fastify';
import { productImageController } from '#src/controllers/product-image.controller.ts';

/** Ảnh của một sản phẩm: liệt kê, tải lên (data URL base64), xoá. */
export const productImageRoutes: FastifyPluginAsync = async (app) => {
  // Ảnh 5 MB mã hoá base64 ≈ 6,7 MB nên route này cần bodyLimit riêng (toàn app mặc định 1 MB).
  app.post('/:id/images', { bodyLimit: 8 * 1024 * 1024 }, productImageController.upload);
  app.get('/:id/images', productImageController.list);
  app.delete('/:id/images/:imageId', productImageController.remove);
};
