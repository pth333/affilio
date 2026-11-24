import { listTemplates, readTemplateContent, type Db, type TemplateContent } from '@affilio/core';

/**
 * Tầng nghiệp vụ của template (định dạng kịch bản): chỉ đọc để màn tạo video chọn được định dạng.
 * Sửa template = thêm version mới trong DB, không sửa bản đang dùng.
 */

export interface TemplateItem {
  id: string;
  version: number;
  name: string;
  content: TemplateContent;
}

/** Template đang dùng được (hệ thống + của workspace), mỗi id lấy version mới nhất. */
export async function listTemplateItems(db: Db, workspaceId: string): Promise<TemplateItem[]> {
  const rows = await listTemplates(db, workspaceId);
  const seen = new Set<string>();
  const items: TemplateItem[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push({ id: row.id, version: row.version, name: row.name, content: readTemplateContent(row) });
  }
  return items;
}
