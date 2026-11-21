import type { FastifyReply, FastifyRequest } from 'fastify';
import { createProductSchema, pageQuerySchema } from '#src/schemas.ts';
import { createProduct, listProductPage } from '#src/services/product.service.ts';
import { validate } from '#src/shared.ts';

/**
 * Tầng controller của sản phẩm: nhận request, validate đầu vào, gọi service và trả response.
 * Không truy vấn DB, không chứa nghiệp vụ.
 */
export const productController = {
  async list(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = validate(pageQuerySchema, req.query);
    const { db, session } = req.server.deps;
    const page = await listProductPage(db, { workspaceId: session.workspaceId, ...query });
    return reply.send(page);
  },

  async create(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = validate(createProductSchema, req.body);
    const { db, session } = req.server.deps;
    const created = await createProduct(db, { workspaceId: session.workspaceId, ...body });
    return reply.status(201).send(created);
  },
};
