import type { FastifyReply, FastifyRequest } from 'fastify';
import { idParamsSchema, productImageParamsSchema, uploadProductImageSchema } from '#src/schemas.ts';
import { addProductImage, listProductImageItems, removeProductImage } from '#src/services/product-image.service.ts';
import { validate } from '#src/shared.ts';

/**
 * Tầng controller của ảnh sản phẩm: nhận request, validate, gọi service và trả response.
 * Không truy vấn DB, không chứa nghiệp vụ.
 */
export const productImageController = {
  async list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const { db, session } = req.server.deps;
    const items = await listProductImageItems(db, { workspaceId: session.workspaceId, productId: id });
    return reply.send({ items });
  },

  async upload(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = validate(idParamsSchema, req.params);
    const input = validate(uploadProductImageSchema, req.body);
    const { db, storage, session } = req.server.deps;
    const image = await addProductImage(db, storage, { workspaceId: session.workspaceId, productId: id, input });
    return reply.status(201).send(image);
  },

  async remove(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id, imageId } = validate(productImageParamsSchema, req.params);
    const { db, session } = req.server.deps;
    await removeProductImage(db, { workspaceId: session.workspaceId, productId: id, imageId });
    return reply.status(204).send();
  },
};
