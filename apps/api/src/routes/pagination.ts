import { z } from 'zod';

/** Phân trang theo con trỏ id (ULID tăng theo thời gian) — ổn định hơn offset khi dữ liệu thay đổi. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(64).optional(),
});

export function nextCursor<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}
