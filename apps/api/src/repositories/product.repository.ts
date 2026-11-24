import { and, desc, eq, isNull, lt, newId, product } from '@affilio/core';
import type { Executor } from '@affilio/core';

/**
 * Tầng repository của sản phẩm: chỉ truy vấn DB, không chứa nghiệp vụ và không biết HTTP.
 */

export type Product = typeof product.$inferSelect;

export interface ListProductsInput {
  workspaceId: string;
  limit: number;
  /** Id của dòng cuối trang trước. */
  cursor?: string | undefined;
}

/** Lấy `limit + 1` dòng để tầng service biết còn trang sau; bỏ qua sản phẩm đã lưu trữ. */
export async function listProducts(db: Executor, { workspaceId, limit, cursor }: ListProductsInput): Promise<Product[]> {
  return db
    .select()
    .from(product)
    .where(and(eq(product.workspaceId, workspaceId), isNull(product.archivedAt), cursor ? lt(product.id, cursor) : undefined))
    .orderBy(desc(product.id))
    .limit(limit + 1);
}

export async function findProduct(
  db: Executor,
  { workspaceId, productId }: { workspaceId: string; productId: string },
): Promise<Product | undefined> {
  const [row] = await db
    .select()
    .from(product)
    .where(and(eq(product.id, productId), eq(product.workspaceId, workspaceId), isNull(product.archivedAt)));
  return row;
}

export interface NewProductInput {
  workspaceId: string;
  name: string;
  affiliateUrl: string;
  sourceUrl?: string | null;
  description?: string | null;
  category?: string | null;
}

export async function insertProduct(db: Executor, input: NewProductInput): Promise<Product> {
  const [row] = await db
    .insert(product)
    .values({
      id: newId('product'),
      workspaceId: input.workspaceId,
      name: input.name,
      affiliateUrl: input.affiliateUrl,
      sourceUrl: input.sourceUrl ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
    })
    .returning();
  if (!row) throw new Error('không tạo được product');
  return row;
}
