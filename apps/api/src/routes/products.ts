import { and, desc, eq, isNull, lt, newId, product } from '@vm/core';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nextCursor, pageQuerySchema } from '#src/routes/pagination.ts';

const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  affiliateUrl: httpUrl,
  sourceUrl: httpUrl.optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(100).optional(),
});

export const productRoutes: FastifyPluginAsync = async (app) => {
  const { db, session } = app.deps;

  app.get('/', async (req) => {
    const { limit, cursor } = pageQuerySchema.parse(req.query);
    const rows = await db
      .select()
      .from(product)
      .where(and(eq(product.workspaceId, session.workspaceId), isNull(product.archivedAt), cursor ? lt(product.id, cursor) : undefined))
      .orderBy(desc(product.id))
      .limit(limit + 1);
    return nextCursor(rows, limit);
  });

  app.post('/', async (req, reply) => {
    const body = createProductSchema.parse(req.body);
    const [row] = await db
      .insert(product)
      .values({
        id: newId('product'),
        workspaceId: session.workspaceId,
        name: body.name,
        affiliateUrl: body.affiliateUrl,
        sourceUrl: body.sourceUrl ?? null,
        description: body.description ?? null,
        category: body.category ?? null,
      })
      .returning();
    return reply.status(201).send(row);
  });
};
