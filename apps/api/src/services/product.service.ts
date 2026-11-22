import type { Db } from '@affilio/core';
import { insertProduct, listProducts, type Product } from '#src/repositories/product.repository.ts';
import type { CreateProductInput } from '#src/schemas.ts';
import { toPage, type Page } from '#src/shared.ts';

/**
 * Tầng nghiệp vụ của sản phẩm. Nhận tham số đã validate từ controller, gọi repository,
 * ném AppError khi vi phạm quy tắc. Không biết gì về HTTP.
 */

export interface ListProductsParams {
  workspaceId: string;
  limit: number;
  cursor?: string | undefined;
}

export async function listProductPage(db: Db, params: ListProductsParams): Promise<Page<Product>> {
  const rows = await listProducts(db, params);
  return toPage(rows, params.limit);
}

export async function createProduct(db: Db, params: { workspaceId: string } & CreateProductInput): Promise<Product> {
  const { workspaceId, ...values } = params;
  return insertProduct(db, { workspaceId, ...values });
}
