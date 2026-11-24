import { createHash, randomUUID } from 'node:crypto';
import { newId, type Db, type Storage } from '@affilio/core';
import { findAssetBySha, insertAsset } from '#src/repositories/asset.repository.ts';
import {
  clearPrimaryImage,
  countProductImages,
  deleteProductImage as deleteProductImageRow,
  findProductImage,
  findProductImageByAsset,
  findProductImageRow,
  insertProductImage,
  listProductImages,
  nextImagePosition,
  type ProductImageRow,
} from '#src/repositories/product-image.repository.ts';
import { findProduct } from '#src/repositories/product.repository.ts';
import type { UploadProductImageInput } from '#src/schemas.ts';
import { badRequest, conflict, notFound } from '#src/shared.ts';

/**
 * Tầng nghiệp vụ của ảnh sản phẩm.
 *
 * Tệp nằm trong Storage, `asset` giữ nội dung + sha256 (dedupe theo workspace),
 * `product_image` giữ liên kết với sản phẩm, thứ tự hiển thị, ảnh chính và alt.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface ProductImageItem {
  id: string;
  assetId: string;
  /** Đường dẫn tương đối cùng origin với web: `/api/media/...`. */
  url: string;
  alt: string | null;
  position: number;
  isPrimary: boolean;
  mime: string;
}

interface ParsedImage {
  mime: string;
  ext: string;
  bytes: Buffer;
}

function parseImageDataUrl(dataUrl: string): ParsedImage {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  const mime = match?.[1];
  const base64 = match?.[2];
  if (!mime || !base64) throw badRequest('Ảnh phải là data URL base64 (png, jpeg hoặc webp)');

  const ext = EXT_BY_MIME[mime];
  if (!ext) throw badRequest(`Định dạng ảnh chưa hỗ trợ: ${mime}`);

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.byteLength === 0) throw badRequest('Ảnh rỗng');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw badRequest('Ảnh tối đa 5 MB');
  return { mime, ext, bytes };
}

export function mediaUrl(storageKey: string): string {
  return `/api/media/${storageKey}`;
}

function toItem(row: ProductImageRow): ProductImageItem {
  return {
    id: row.id,
    assetId: row.assetId,
    url: mediaUrl(row.storageKey),
    alt: row.alt,
    position: row.position,
    isPrimary: row.isPrimary,
    mime: row.mime,
  };
}

/**
 * Trả về id của asset chứa ảnh: dùng lại nếu workspace đã có tệp cùng sha256,
 * nếu chưa thì ghi tệp vào Storage rồi tạo dòng `asset`.
 */
async function ensureAsset(
  db: Db,
  storage: Storage,
  input: { workspaceId: string; productId: string; mime: string; ext: string; bytes: Buffer; sha256: string },
): Promise<string> {
  const existing = await findAssetBySha(db, { workspaceId: input.workspaceId, sha256: input.sha256 });
  if (existing) return existing.id;

  const assetId = newId('asset');
  // Khóa nằm trong namespace của workspace để route /api/media chỉ phục vụ tệp của chính workspace đó.
  const storageKey = `ws/${input.workspaceId}/products/${input.productId}/${randomUUID()}.${input.ext}`;
  const stored = await storage.put(storageKey, input.bytes);

  try {
    const row = await insertAsset(db, {
      id: assetId,
      workspaceId: input.workspaceId,
      kind: 'product_image',
      storageKey: stored.key,
      sha256: input.sha256,
      mime: input.mime,
      productId: input.productId,
      source: 'self',
    });
    return row.id;
  } catch (err) {
    // Hai lần upload đồng thời cùng nội dung: unique index (workspace_id, sha256) chặn, dùng bản đã có.
    const raced = await findAssetBySha(db, { workspaceId: input.workspaceId, sha256: input.sha256 });
    if (raced) return raced.id;
    throw err;
  }
}

export interface AddProductImageParams {
  workspaceId: string;
  productId: string;
  input: UploadProductImageInput;
}

export async function addProductImage(db: Db, storage: Storage, params: AddProductImageParams): Promise<ProductImageItem> {
  const product = await findProduct(db, params);
  if (!product) throw notFound('Không tìm thấy sản phẩm');

  const { mime, ext, bytes } = parseImageDataUrl(params.input.dataUrl);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const assetId = await ensureAsset(db, storage, {
    workspaceId: params.workspaceId,
    productId: params.productId,
    mime,
    ext,
    bytes,
    sha256,
  });

  if (await findProductImageByAsset(db, { productId: params.productId, assetId })) {
    throw conflict('Ảnh này đã có trong sản phẩm');
  }

  const isFirst = (await countProductImages(db, params.productId)) === 0;
  const isPrimary = params.input.isPrimary ?? isFirst;
  const imageId = newId('productImage');

  await db.transaction(async (tx) => {
    if (isPrimary) await clearPrimaryImage(tx, params.productId);
    await insertProductImage(tx, {
      id: imageId,
      workspaceId: params.workspaceId,
      productId: params.productId,
      assetId,
      position: await nextImagePosition(tx, params.productId),
      isPrimary,
      alt: params.input.alt ?? null,
    });
  });

  const row = await findProductImageRow(db, imageId);
  if (!row) throw new Error('không đọc lại được product_image vừa tạo');
  return toItem(row);
}

export async function listProductImageItems(
  db: Db,
  params: { workspaceId: string; productId: string },
): Promise<ProductImageItem[]> {
  const product = await findProduct(db, params);
  if (!product) throw notFound('Không tìm thấy sản phẩm');
  return (await listProductImages(db, params)).map(toItem);
}

/** Xoá liên kết ảnh khỏi sản phẩm; tệp trong Storage được giữ lại vì có thể dùng chung (dedupe theo sha256). */
export async function removeProductImage(
  db: Db,
  params: { workspaceId: string; productId: string; imageId: string },
): Promise<void> {
  const image = await findProductImage(db, params);
  if (!image) throw notFound('Không tìm thấy ảnh');
  await deleteProductImageRow(db, image.id);
}
