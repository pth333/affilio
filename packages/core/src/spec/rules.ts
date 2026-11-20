import type { RuleResult } from '#src/db/schema.ts';
import { estimateSceneDuration, estimateTotalDuration, usesAi, type VideoSpec } from '#src/spec/schema.ts';

/** Luật cứng: luôn chạy, không tốn tiền (mục 4 plan v4). */

export const DURATION_RANGE_SEC = { min: 8, max: 90 } as const;
export const AI_CLIP_LIMIT = { maxClips: 2, maxSecondsEach: 5 } as const;

/** Từ/cụm cam kết quá đà. So khớp không phân biệt hoa thường. */
export const OVERCLAIM_PHRASES = [
  'cam kết 100%',
  'hiệu quả 100%',
  'chắc chắn khỏi',
  'khỏi hẳn',
  'tốt nhất thế giới',
  'rẻ nhất thị trường',
  'không có tác dụng phụ',
  'đảm bảo hoàn tiền',
  'trị dứt điểm',
] as const;

export interface HardRuleContext {
  affiliateUrl: string | null | undefined;
  /** asset_id ảnh thuộc sản phẩm; bỏ qua luật nếu không truyền. */
  productAssetIds?: readonly string[];
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    // URL sai định dạng → coi là không hợp lệ.
    return false;
  }
}

export function checkHardRules(spec: VideoSpec, ctx: HardRuleContext): RuleResult[] {
  const results: RuleResult[] = [];

  const total = estimateTotalDuration(spec);
  results.push({
    rule: 'duration_range',
    passed: total >= DURATION_RANGE_SEC.min && total <= DURATION_RANGE_SEC.max,
    message: `ước tính ${total.toFixed(1)}s (cho phép ${DURATION_RANGE_SEC.min}-${DURATION_RANGE_SEC.max}s)`,
  });

  results.push({
    rule: 'affiliate_link',
    passed: isHttpUrl(ctx.affiliateUrl),
    ...(isHttpUrl(ctx.affiliateUrl) ? {} : { message: 'thiếu hoặc sai link affiliate' }),
  });

  results.push({
    rule: 'ai_label',
    passed: true,
    ...(usesAi(spec) ? { message: 'có ảnh/clip AI: phải bật nhãn nội dung AI khi đăng' } : {}),
  });

  const text = spec.scenes.map((s) => s.narration.toLowerCase()).join('\n');
  const hits = OVERCLAIM_PHRASES.filter((p) => text.includes(p));
  results.push({
    rule: 'no_overclaim',
    passed: hits.length === 0,
    ...(hits.length ? { message: `có cụm cam kết quá đà: ${hits.join(', ')}` } : {}),
  });

  if (ctx.productAssetIds) {
    const allowed = new Set(ctx.productAssetIds);
    const foreign = spec.scenes
      .filter((s) => s.visual.type === 'image' && s.visual.asset_id && !allowed.has(s.visual.asset_id))
      .map((s) => s.id);
    results.push({
      rule: 'product_image_owner',
      passed: foreign.length === 0,
      ...(foreign.length ? { message: `ảnh không thuộc sản phẩm ở cảnh: ${foreign.join(', ')}` } : {}),
    });
  }

  // Mascot nằm ở hai bên giữa khung (schema giới hạn position) và không vượt quá thời lượng cảnh.
  const badMascot = spec.scenes
    .filter((s) => s.mascot && s.mascot.to > estimateSceneDuration(s) + 0.01)
    .map((s) => s.id);
  results.push({
    rule: 'mascot_within_scene',
    passed: badMascot.length === 0,
    ...(badMascot.length ? { message: `mascot vượt thời lượng cảnh: ${badMascot.join(', ')}` } : {}),
  });

  const clips = spec.scenes.filter((s) => s.visual.type === 'ai_clip');
  const longClips = clips.filter((s) => estimateSceneDuration(s) > AI_CLIP_LIMIT.maxSecondsEach);
  results.push({
    rule: 'ai_clip_limit',
    passed: clips.length <= AI_CLIP_LIMIT.maxClips && longClips.length === 0,
    ...(clips.length > AI_CLIP_LIMIT.maxClips || longClips.length
      ? { message: `tối đa ${AI_CLIP_LIMIT.maxClips} clip AI, mỗi clip ≤ ${AI_CLIP_LIMIT.maxSecondsEach}s` }
      : {}),
  });

  return results;
}

export function allPassed(results: readonly RuleResult[]): boolean {
  return results.every((r) => r.passed);
}
