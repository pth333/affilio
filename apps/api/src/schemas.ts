import { REVIEW_DECISIONS, VIDEO_STATUSES } from '@affilio/core';
import { z } from 'zod';

/**
 * Toàn bộ schema validate dữ liệu đầu vào của API. Controller chỉ làm việc với dữ liệu
 * đã qua các schema này nên service không phải kiểm tra lại kiểu.
 */

const MAX_ID_LENGTH = 64;
const idSchema = z.string().min(1).max(MAX_ID_LENGTH);
const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

/** Tham số đường dẫn `:id`. */
export const idParamsSchema = z.object({ id: idSchema });

/** Tham số đường dẫn của một cảnh trong video. */
export const sceneParamsSchema = z.object({ id: idSchema, sceneId: idSchema });

/** Phân trang theo con trỏ, dùng chung cho các endpoint danh sách. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: idSchema.optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

// ───────────────────────── Sản phẩm ─────────────────────────

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  affiliateUrl: httpUrl,
  sourceUrl: httpUrl.optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().max(100).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

// ───────────────────────── Video ─────────────────────────

export const videoListQuerySchema = pageQuerySchema.extend({ status: z.enum(VIDEO_STATUSES).optional() });
export type VideoListQuery = z.infer<typeof videoListQuerySchema>;

export const createVideoSchema = z.object({
  productId: idSchema,
  /** Định dạng kịch bản (template); bỏ trống = template mặc định. */
  templateId: idSchema.optional(),
  /** Kịch bản người dùng đã duyệt (VideoSpec); có thì workflow không gọi AI. */
  spec: z.unknown().optional(),
});
export type CreateVideoInput = z.infer<typeof createVideoSchema>;

/** Gợi ý kịch bản trước khi tạo video: chỉ cần sản phẩm + template. */
export const suggestVideoScriptSchema = z.object({ productId: idSchema, templateId: idSchema });
export type SuggestVideoScriptInput = z.infer<typeof suggestVideoScriptSchema>;

/** `versionId` là bản người duyệt đang xem; service từ chối nếu đã có bản mới hơn. */
export const reviewVideoSchema = z.object({
  versionId: idSchema,
  decision: z.enum(REVIEW_DECISIONS),
});
export type ReviewVideoInput = z.infer<typeof reviewVideoSchema>;

export const addReviewNoteSchema = z.object({
  versionId: idSchema,
  sceneId: idSchema,
  text: z.string().trim().min(1).max(2000),
});
export type AddReviewNoteInput = z.infer<typeof addReviewNoteSchema>;

// ───────────────────────── Ảnh sản phẩm ─────────────────────────

/** Data URL base64 do trình duyệt tạo từ File; chỉ nhận png/jpeg/webp. */
export const uploadProductImageSchema = z.object({
  dataUrl: z
    .string()
    .max(8_000_000, 'Ảnh tối đa 5 MB')
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Ảnh phải là data URL base64 (png, jpeg hoặc webp)'),
  alt: z.string().trim().max(200).optional(),
  /** Bỏ trống: ảnh đầu tiên của sản phẩm tự thành ảnh chính. */
  isPrimary: z.boolean().optional(),
});
export type UploadProductImageInput = z.infer<typeof uploadProductImageSchema>;

export const productImageParamsSchema = z.object({ id: idSchema, imageId: idSchema });

/** Khóa tệp trên đường dẫn `/api/media/*` (chứa dấu `/` nên dùng wildcard). */
export const mediaParamsSchema = z.object({ '*': z.string().min(1).max(1024) });


/** Người duyệt sửa tay lời thoại của một cảnh (tạo phiên bản mới). */
export const updateSceneSchema = z.object({
  versionId: idSchema,
  narration: z.string().trim().min(1).max(400),
});
export type UpdateSceneInput = z.infer<typeof updateSceneSchema>;

/** Nhờ AI viết lại một cảnh, kèm chỉ dẫn tuỳ chọn. */
export const reviseSceneSchema = z.object({
  versionId: idSchema,
  instruction: z.string().trim().max(1000).optional(),
});
export type ReviseSceneInput = z.infer<typeof reviseSceneSchema>;
