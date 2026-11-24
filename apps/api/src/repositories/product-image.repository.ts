import { and, asc, eq, sql } from '@affilio/core';
import type { Executor } from '@affilio/core';
import { asset, productImage } from '@affilio/core';

/**
 * Tầng repository của ảnh sản phẩm: bảng `product_image` nối product ↔ asset,
 * giữ thứ tự hiển thị, ảnh chính và alt text.
 */

export type ProductImage = typeof productImage.$inferSelect;

/** Dòng ảnh kèm thông tin tệp để trả về client. */
export interface ProductImageRow {
  id: string;
  assetId: string;
  alt: string | null;
  position: number;
  isPrimary: boolean;
  storageKey: string;
  mime: string;
}

const ROW_SELECT = {
  id: productImage.id,
  assetId: productImage.assetId,
  alt: productImage.alt,
  position: productImage.position,
  isPrimary: productImage.isPrimary,
  storageKey: asset.storageKey,
  mime: asset.mime,
} as const;

export async function listProductImages(
  db: Executor,
  { workspaceId, productId }: { workspaceId: string; productId: string },
): Promise<ProductImageRow[]> {
  return db
    .select(ROW_SELECT)
    .from(productImage)
    .innerJoin(asset, eq(asset.id, productImage.assetId))
    .where(and(eq(productImage.workspaceId, workspaceId), eq(productImage.productId, productId)))
    .orderBy(asc(productImage.position), asc(productImage.id));
}

export async function findProductImageRow(db: Executor, imageId: string): Promise<ProductImageRow | undefined> {
  const [row] = await db
    .select(ROW_SELECT)
    .from(productImage)
    .innerJoin(asset, eq(asset.id, productImage.assetId))
    .where(eq(productImage.id, imageId));
  return row;
}

export async function findProductImage(
  db: Executor,
  { workspaceId, productId, imageId }: { workspaceId: string; productId: string; imageId: string },
): Promise<ProductImage | undefined> {
  const [row] = await db
    .select()
    .from(productImage)
    .where(
      and(eq(productImage.id, imageId), eq(productImage.productId, productId), eq(productImage.workspaceId, workspaceId)),
    );
  return row;
}

export async function findProductImageByAsset(
  db: Executor,
  { productId, assetId }: { productId: string; assetId: string },
): Promise<ProductImage | undefined> {
  const [row] = await db
    .select()
    .from(productImage)
    .where(and(eq(productImage.productId, productId), eq(productImage.assetId, assetId)));
  return row;
}

export async function countProductImages(db: Executor, productId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productImage)
    .where(eq(productImage.productId, productId));
  return row?.n ?? 0;
}

/** Vị trí kế tiếp trong danh sách ảnh (0 khi chưa có ảnh nào). */
export async function nextImagePosition(db: Executor, productId: string): Promise<number> {
  const [row] = await db
    .select({ last: sql<number | null>`max(${productImage.position})` })
    .from(productImage)
    .where(eq(productImage.productId, productId));
  return (row?.last ?? -1) + 1;
}

/**
 * Bỏ cờ ảnh chính của các ảnh khác trong cùng sản phẩm.
 * Unique index `product_image_one_primary_uq` chỉ cho phép một ảnh chính mỗi sản phẩm.
 */
export async function clearPrimaryImage(db: Executor, productId: string): Promise<void> {
  await db.update(productImage).set({ isPrimary: false }).where(and(eq(productImage.productId, productId), eq(productImage.isPrimary, true)));
}

export interface InsertProductImageInput {
  id: string;
  workspaceId: string;
  productId: string;
  assetId: string;
  position: number;
  isPrimary: boolean;
  alt?: string | null;
}

export async function insertProductImage(db: Executor, input: InsertProductImageInput): Promise<ProductImage> {
  const [row] = await db
    .insert(productImage)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      productId: input.productId,
      assetId: input.assetId,
      position: input.position,
      isPrimary: input.isPrimary,
      alt: input.alt ?? null,
    })
    .returning();
  if (!row) throw new Error('không tạo được product_image');
  return row;
}

export async function deleteProductImage(db: Executor, imageId: string): Promise<void> {
  await db.delete(productImage).where(eq(productImage.id, imageId));
}
