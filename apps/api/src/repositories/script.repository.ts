import { and, desc, eq, ilike, lt, product, script, scriptVersion, sql, video } from '@affilio/core';
import type { Executor, ScriptOrigin, ScriptStatus, ScriptVersionSource } from '@affilio/core';

/**
 * Tầng repository của kịch bản: chỉ truy vấn DB, không chứa nghiệp vụ và không biết HTTP.
 * Thao tác ghi (tạo/sửa/chuyển trạng thái) nằm ở `@affilio/core` vì worker dùng chung.
 */

/** Dòng của danh sách kịch bản (kèm tên sản phẩm và số video đã tạo để UI không phải gọi thêm). */
export interface ScriptListItem {
  id: string;
  status: ScriptStatus;
  origin: ScriptOrigin;
  productId: string;
  productName: string;
  templateId: string | null;
  currentVersionId: string | null;
  /** Nguồn phiên bản hiện tại: `ai_draft` + chưa có video = "Mới" (người dùng chưa xem/sửa). */
  currentSource: ScriptVersionSource | null;
  failedReason: string | null;
  videoCount: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface ListScriptsInput {
  workspaceId: string;
  status?: ScriptStatus | undefined;
  productId?: string | undefined;
  /** Tìm theo tên sản phẩm (không phân biệt hoa thường). */
  q?: string | undefined;
  limit: number;
  /** Id của dòng cuối trang trước. */
  cursor?: string | undefined;
}

/** Ký tự đặc biệt của LIKE phải escape để người dùng gõ `%`/`_` không thành wildcard. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Lấy `limit + 1` dòng để tầng service biết còn trang sau.
 * Không chọn trạng thái thì ẩn kịch bản đã lưu trữ.
 */
export async function listScripts(
  db: Executor,
  { workspaceId, status, productId, q, limit, cursor }: ListScriptsInput,
): Promise<ScriptListItem[]> {
  return db
    .select({
      id: script.id,
      status: script.status,
      origin: script.origin,
      productId: script.productId,
      productName: product.name,
      templateId: script.templateId,
      currentVersionId: script.currentVersionId,
      currentSource: scriptVersion.source,
      failedReason: script.failedReason,
      videoCount: sql<number>`(select count(*) from ${video} where ${video.scriptId} = ${script.id})::int`,
      updatedAt: script.updatedAt,
      createdAt: script.createdAt,
    })
    .from(script)
    .innerJoin(product, eq(product.id, script.productId))
    .leftJoin(scriptVersion, eq(scriptVersion.id, script.currentVersionId))
    .where(
      and(
        eq(script.workspaceId, workspaceId),
        status ? eq(script.status, status) : sql`${script.status} <> 'archived'`,
        productId ? eq(script.productId, productId) : undefined,
        q ? ilike(product.name, likePattern(q)) : undefined,
        cursor ? lt(script.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(script.id))
    .limit(limit + 1);
}

/** Tên sản phẩm của kịch bản (trang chi tiết hiện kèm). */
export async function findProductName(
  db: Executor,
  { workspaceId, productId }: { workspaceId: string; productId: string },
): Promise<string | null> {
  const [row] = await db
    .select({ name: product.name })
    .from(product)
    .where(and(eq(product.id, productId), eq(product.workspaceId, workspaceId)));
  return row?.name ?? null;
}

/** Số video đã tạo từ kịch bản. */
export async function countScriptVideos(db: Executor, scriptId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(video)
    .where(eq(video.scriptId, scriptId));
  return row?.n ?? 0;
}
