import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '#src/db/index.ts';
import { newId } from '#src/db/id.ts';
import { asset, product, video } from '#src/db/schema.ts';
import { startDraftWorkflow, type TemporalClient } from '#src/temporal/index.ts';
import { REAL_ONLY_ROLES, SCENE_ROLES, SPEC_SCHEMA_VERSION, validateSpec, type Scene, type ValidationResult, type VideoSpec } from '#src/spec/schema.ts';
import { markVideoFailed, writeAudit, type Video } from '#src/video/index.ts';

export type DraftOutcome =
  | { ok: true; video: Video; workflowId: string }
  | { ok: false; reason: 'product_not_found'; message: string };

/**
 * Tạo video mới cho sản phẩm rồi start workflow viết nháp trên Temporal.
 * Start sau khi commit (worker phải thấy video); start lỗi thì đánh dấu video failed để không treo ở `queued`.
 */
export async function requestDraft(
  db: Db,
  temporal: TemporalClient,
  { workspaceId, productId, userId }: { workspaceId: string; productId: string; userId: string | null },
): Promise<DraftOutcome> {
  const created = await db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, productId), eq(product.workspaceId, workspaceId), isNull(product.archivedAt)));
    if (!p) return null;

    const [v] = await tx
      .insert(video)
      .values({ id: newId('video'), workspaceId, productId, status: 'queued', createdBy: userId })
      .returning();
    if (!v) throw new Error('không tạo được video');
    await writeAudit(tx, { workspaceId, userId, action: 'video.create', targetType: 'video', targetId: v.id, data: { productId } });
    return v;
  });
  if (!created) return { ok: false, reason: 'product_not_found', message: 'không tìm thấy sản phẩm' };

  try {
    const { workflowId } = await startDraftWorkflow(temporal, { workspaceId, videoId: created.id });
    return { ok: true, video: created, workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markVideoFailed(db, created.id, 'drafting', `không start được workflow: ${message}`);
    throw new Error(`không start được workflow viết nháp cho video ${created.id}`, { cause: err });
  }
}

// ───────────────────────── Kịch bản LLM → spec ─────────────────────────

export const DRAFT_SYSTEM_PROMPT = [
  'Bạn viết kịch bản video ngắn dọc (TikTok/Reels) bán hàng affiliate bằng tiếng Việt.',
  'Trả về DUY NHẤT một JSON: {"scenes":[{"role":"hook|intro|problem|benefit|demo|proof|compare|cta","narration":"...","prompt":"english image prompt hoặc null"}]}',
  '4–7 cảnh, mỗi cảnh 1–2 câu. Cảnh demo/proof dùng ảnh thật nên prompt = null.',
  'Không cam kết quá đà (100%, khỏi hẳn, tốt nhất thế giới…). Cảnh cuối là cta.',
].join('\n');

export function buildDraftPrompt(p: { name: string; description: string | null; category: string | null }): string {
  return [`Sản phẩm: ${p.name}`, p.category ? `Danh mục: ${p.category}` : '', p.description ? `Mô tả: ${p.description}` : '']
    .filter(Boolean)
    .join('\n');
}

const llmScriptSchema = z.object({
  scenes: z
    .array(
      z.object({
        role: z.enum(SCENE_ROLES).catch('benefit'),
        narration: z.string().min(1),
        prompt: z.string().nullish(),
      }),
    )
    .min(1)
    .max(20),
});

/** Lấy khối JSON đầu tiên trong câu trả lời (LLM hay kèm chữ thừa hoặc ```json). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('câu trả lời LLM không chứa JSON');
  return JSON.parse(text.slice(start, end + 1));
}

export interface BuildSpecInput {
  llmText: string;
  productId: string;
  productImageIds: readonly string[];
  voice: { provider: string; name: string };
  template?: { id: string; version: number };
}

/**
 * Ghép kịch bản LLM thành VideoSpec hợp lệ:
 * - cảnh demo/proof hoặc cảnh không có prompt dùng ảnh sản phẩm thật (xoay vòng)
 * - không có ảnh sản phẩm thì bỏ cảnh demo/proof, còn lại dùng ảnh AI
 */
export function buildDraftSpec(input: BuildSpecInput): ValidationResult<VideoSpec> {
  let script: z.infer<typeof llmScriptSchema>;
  try {
    const parsed = llmScriptSchema.safeParse(extractJson(input.llmText));
    if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
    script = parsed.data;
  } catch (err) {
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }

  const images = input.productImageIds;
  const motions = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'] as const;
  let imageIdx = 0;
  const scenes: Scene[] = [];
  script.scenes.forEach((s, i) => {
    const realOnly = REAL_ONLY_ROLES.includes(s.role);
    const useProductImage = images.length > 0 && (realOnly || !s.prompt);
    if (realOnly && !useProductImage) return;
    const motion = motions[i % motions.length] ?? 'static';
    scenes.push({
      id: `s${scenes.length + 1}`,
      role: s.role,
      lock: null,
      narration: s.narration.trim(),
      duration: null,
      voice: { provider: input.voice.provider, name: input.voice.name, rate: 1 },
      visual: useProductImage
        ? { type: 'image', asset_id: images[imageIdx++ % images.length] ?? null, motion }
        : { type: 'ai_image', prompt: s.prompt ?? `product photo for ${s.role} scene, vertical 9:16`, asset_id: null, motion },
      mascot: null,
    });
  });

  return validateSpec({
    schema: SPEC_SCHEMA_VERSION,
    product_id: input.productId,
    template: input.template ?? { id: 'default', version: 1 },
    cta: { enabled: true },
    music: null,
    scenes,
  });
}

/** Ảnh sản phẩm thật dùng cho cảnh image. */
export async function productImageIds(db: Db, workspaceId: string, productId: string): Promise<string[]> {
  const rows = await db
    .select({ id: asset.id })
    .from(asset)
    .where(and(eq(asset.workspaceId, workspaceId), eq(asset.productId, productId), inArray(asset.kind, ['product_image'])));
  return rows.map((r) => r.id);
}
