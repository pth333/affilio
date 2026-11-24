import { and, eq } from '@affilio/core';
import type { AssetKind, AssetSource, Executor } from '@affilio/core';
import { asset } from '@affilio/core';

/**
 * Tầng repository của tệp: chỉ truy vấn DB, không chứa nghiệp vụ và không biết HTTP.
 * Tệp nằm trong Storage, DB chỉ giữ khóa tương đối.
 */

export type Asset = typeof asset.$inferSelect;

export async function findAssetBySha(
  db: Executor,
  { workspaceId, sha256 }: { workspaceId: string; sha256: string },
): Promise<Asset | undefined> {
  const [row] = await db
    .select()
    .from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), eq(asset.sha256, sha256)));
  return row;
}

export interface InsertAssetInput {
  workspaceId: string;
  kind: AssetKind;
  storageKey: string;
  sha256: string;
  mime: string;
  source: AssetSource;
  productId?: string | null;
}

export async function insertAsset(db: Executor, input: InsertAssetInput & { id: string }): Promise<Asset> {
  const [row] = await db
    .insert(asset)
    .values({
      id: input.id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      storageKey: input.storageKey,
      sha256: input.sha256,
      mime: input.mime,
      productId: input.productId ?? null,
      source: input.source,
      meta: {},
    })
    .returning();
  if (!row) throw new Error('không tạo được asset');
  return row;
}
