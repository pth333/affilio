import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '#src/db/index.ts';
import { template } from '#src/db/schema.ts';
import { SCENE_ROLES } from '#src/spec/schema.ts';

/**
 * Template = "định dạng kịch bản": thứ tự cảnh, giọng điệu, giọng đọc.
 * Nội dung template được ghép vào prompt cho LLM nên đổi định dạng = thêm version mới.
 */

export const templateContentSchema = z.object({
  /** Các cảnh theo đúng thứ tự muốn có trong kịch bản. */
  scenes: z
    .array(
      z.object({
        role: z.enum(SCENE_ROLES),
        /** Gợi ý nội dung cho cảnh này (đưa nguyên văn vào prompt). */
        brief: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(12),
  tone: z.string().min(1).default('thân thiện, thuyết phục, không cam kết quá đà'),
  voice: z
    .object({ provider: z.string().min(1), name: z.string().min(1) })
    .default({ provider: 'edge', name: 'vi-VN-HoaiMyNeural' }),
  /** Số câu tối đa mỗi cảnh. */
  maxSentencesPerScene: z.number().int().min(1).max(4).default(2),
});
export type TemplateContent = z.infer<typeof templateContentSchema>;

export type Template = typeof template.$inferSelect;

/** Template mặc định dùng khi video không chọn template hoặc template hỏng. */
export const FALLBACK_CONTENT: TemplateContent = {
  scenes: [
    { role: 'hook', brief: 'Nêu vấn đề hoặc điểm đau của người xem' },
    { role: 'problem', brief: 'Vì sao cách thông thường không giải quyết được' },
    { role: 'benefit', brief: 'Điểm mạnh chính, cụ thể, có số liệu nếu có' },
    { role: 'demo', brief: 'Cảnh quay thật cách dùng sản phẩm' },
    { role: 'cta', brief: 'Mời bấm link ở bio, nêu ưu đãi nếu có' },
  ],
  tone: 'thân thiện, thuyết phục, không cam kết quá đà',
  voice: { provider: 'edge', name: 'vi-VN-HoaiMyNeural' },
  maxSentencesPerScene: 2,
};

export const DEFAULT_TEMPLATE_ID = 'tpl-ugc';

/** Template hệ thống (workspace_id null) được seed khi khởi động. */
export const DEFAULT_TEMPLATES: readonly { id: string; name: string; content: TemplateContent }[] = [
  {
    id: DEFAULT_TEMPLATE_ID,
    name: 'Review trải nghiệm (UGC)',
    content: {
      scenes: [
        { role: 'hook', brief: 'Nêu đúng nỗi đau người xem đang gặp' },
        { role: 'problem', brief: 'Cách thông thường thất bại ở đâu' },
        { role: 'benefit', brief: 'Điểm mạnh chính, càng cụ thể càng tốt' },
        { role: 'demo', brief: 'Cảnh quay thật, thao tác sử dụng sản phẩm' },
        { role: 'cta', brief: 'Mời bấm link ở bio, nhắc ưu đãi nếu có' },
      ],
      tone: 'như người thật review, gần gũi, không quảng cáo lộ liễu',
      voice: { provider: 'edge', name: 'vi-VN-HoaiMyNeural' },
      maxSentencesPerScene: 2,
    },
  },
  {
    id: 'tpl-top3',
    name: 'Top 3 lý do',
    content: {
      scenes: [
        { role: 'hook', brief: 'Hứa hẹn 3 lý do khiến người xem phải xem hết' },
        { role: 'benefit', brief: 'Lý do thứ nhất, cụ thể và dễ hiểu' },
        { role: 'benefit', brief: 'Lý do thứ hai' },
        { role: 'proof', brief: 'Bằng chứng thật: ảnh sản phẩm, phản hồi người dùng' },
        { role: 'cta', brief: 'Kết lại bằng lời mời mua kèm ưu đãi' },
      ],
      tone: 'dứt khoát, liệt kê nhanh, nhiều thông tin',
      voice: { provider: 'edge', name: 'vi-VN-NamMinhNeural' },
      maxSentencesPerScene: 2,
    },
  },
  {
    id: 'tpl-before-buy',
    name: 'Cảnh báo trước khi mua',
    content: {
      scenes: [
        { role: 'hook', brief: 'Cảnh báo: đừng mua nếu chưa biết điều này' },
        { role: 'problem', brief: 'Sai lầm thường gặp khi chọn sản phẩm loại này' },
        { role: 'benefit', brief: 'Sản phẩm này khác gì, giải quyết đúng vấn đề đó' },
        { role: 'cta', brief: 'Chốt bằng link mua an toàn, chính hãng' },
      ],
      tone: 'cảnh báo nhưng thiện chí, đáng tin',
      voice: { provider: 'edge', name: 'vi-VN-HoaiMyNeural' },
      maxSentencesPerScene: 2,
    },
  },
  {
    id: 'tpl-compare',
    name: 'So sánh A vs B',
    content: {
      scenes: [
        { role: 'hook', brief: 'Đặt câu hỏi: nên chọn cái nào?' },
        { role: 'compare', brief: 'So sánh trực tiếp hai lựa chọn cùng phân khúc' },
        { role: 'proof', brief: 'Bằng chứng thật để kết luận' },
        { role: 'cta', brief: 'Kết luận + link mua sản phẩm được chọn' },
      ],
      tone: 'khách quan, có so sánh, không dìm hàng quá đà',
      voice: { provider: 'edge', name: 'vi-VN-NamMinhNeural' },
      maxSentencesPerScene: 3,
    },
  },
];

/** Ghi các template hệ thống nếu chưa có (idempotent). */
export async function seedDefaultTemplates(db: Db): Promise<void> {
  for (const item of DEFAULT_TEMPLATES) {
    await db
      .insert(template)
      .values({ id: item.id, version: 1, workspaceId: null, name: item.name, status: 'active', content: item.content })
      .onConflictDoNothing();
  }
}

/** Template đang dùng được: hệ thống (workspace_id null) + của workspace, chỉ bản active. */
export async function listTemplates(db: Db, workspaceId: string): Promise<Template[]> {
  return db
    .select()
    .from(template)
    .where(and(eq(template.status, 'active'), or(isNull(template.workspaceId), eq(template.workspaceId, workspaceId))))
    .orderBy(asc(template.name), desc(template.version));
}

/** Template theo id, lấy version cao nhất đang active. */
export async function findTemplate(
  db: Db,
  { templateId, workspaceId }: { templateId: string; workspaceId: string },
): Promise<Template | undefined> {
  const [row] = await db
    .select()
    .from(template)
    .where(
      and(
        eq(template.id, templateId),
        eq(template.status, 'active'),
        or(isNull(template.workspaceId), eq(template.workspaceId, workspaceId)),
      ),
    )
    .orderBy(desc(template.version))
    .limit(1);
  return row;
}

/** Đọc nội dung template; template hỏng/thiếu trường thì quay về định dạng mặc định. */
export function readTemplateContent(row: Template): TemplateContent {
  const parsed = templateContentSchema.safeParse(row.content);
  return parsed.success ? parsed.data : FALLBACK_CONTENT;
}

/** Nội dung template đang dùng cho một video (null = dùng mặc định). */
export async function templateContentFor(db: Db, workspaceId: string, templateId: string | null): Promise<TemplateContent> {
  if (!templateId) return FALLBACK_CONTENT;
  const row = await findTemplate(db, { templateId, workspaceId });
  return row ? readTemplateContent(row) : FALLBACK_CONTENT;
}

/** Mô tả định dạng cho LLM, sinh từ nội dung template. */
export function templatePrompt(content: TemplateContent): string {
  return [
    `Kịch bản có đúng ${content.scenes.length} cảnh, theo thứ tự:`,
    ...content.scenes.map((scene, index) => `${index + 1}. ${scene.role}${scene.brief ? ` — ${scene.brief}` : ''}`),
    `Giọng điệu: ${content.tone}.`,
    `Mỗi cảnh tối đa ${content.maxSentencesPerScene} câu.`,
    'Cảnh cuối phải là lời kêu gọi hành động (cta).',
  ].join('\n');
}

/** System prompt cho LLM: nhiệm vụ + định dạng JSON + định dạng của template. */
export function buildDraftSystemPrompt(content: TemplateContent): string {
  return [
    'Bạn viết kịch bản video ngắn dọc (TikTok/Reels) bán hàng affiliate bằng tiếng Việt.',
    'Trả về DUY NHẤT một JSON: {"scenes":[{"role":"hook|intro|problem|benefit|demo|proof|compare|cta","narration":"...","prompt":"english image prompt hoặc null"}]}',
    templatePrompt(content),
    'Cảnh demo/proof dùng ảnh thật nên prompt = null.',
    'Không cam kết quá đà (100%, khỏi hẳn, tốt nhất thế giới…).',
  ].join('\n');
}
