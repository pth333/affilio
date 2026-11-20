import { describe, expect, it } from 'vitest';
import { VIDEO_STATUSES } from '#src/db/schema.ts';
import { buildDraftSpec, extractJson } from '#src/video/draft.ts';
import { canFinalRender, canTransition, VIDEO_TRANSITIONS } from '#src/video/index.ts';

describe('máy trạng thái video', () => {
  it('khai báo đủ mọi trạng thái và chỉ trỏ tới trạng thái có thật', () => {
    expect(Object.keys(VIDEO_TRANSITIONS).sort()).toEqual([...VIDEO_STATUSES].sort());
    for (const targets of Object.values(VIDEO_TRANSITIONS)) {
      for (const t of targets) expect(VIDEO_STATUSES).toContain(t);
    }
  });

  it('không render khi chưa duyệt; published là trạng thái cuối', () => {
    expect(canTransition('pending_review', 'rendering')).toBe(false);
    expect(canTransition('approved', 'rendering')).toBe(true);
    expect(VIDEO_TRANSITIONS.published).toHaveLength(0);
  });

  it('canFinalRender chỉ đúng khi bản đã duyệt là bản hiện tại', () => {
    expect(canFinalRender({ status: 'approved', approvedVersionId: 'v1', currentVersionId: 'v1' })).toBe(true);
    expect(canFinalRender({ status: 'approved', approvedVersionId: 'v1', currentVersionId: 'v2' })).toBe(false);
    expect(canFinalRender({ status: 'pending_review', approvedVersionId: 'v1', currentVersionId: 'v1' })).toBe(false);
    expect(canFinalRender({ status: 'approved', approvedVersionId: null, currentVersionId: null })).toBe(false);
  });
});

describe('buildDraftSpec', () => {
  const script = {
    scenes: [
      { role: 'hook', narration: 'Mùa hè nóng quá, nước đá tan nhanh phải không?', prompt: 'sweaty person summer' },
      { role: 'demo', narration: 'Bình này giữ đá cả ngày, mình test thật luôn nè.', prompt: null },
      { role: 'lạ', narration: 'Thép không gỉ, nhẹ, bỏ túi xách vừa khít.', prompt: null },
      { role: 'cta', narration: 'Bấm link dưới video để mua với giá tốt nhé.', prompt: 'call to action banner' },
    ],
  };
  const llmText = `Đây là kịch bản:\n\`\`\`json\n${JSON.stringify(script)}\n\`\`\``;
  const base = { llmText, productId: 'prd_1', voice: { provider: 'stub', name: 'vi' } };

  it('dùng ảnh thật xoay vòng cho cảnh demo/không prompt, ảnh AI cho cảnh có prompt', () => {
    const r = buildDraftSpec({ ...base, productImageIds: ['ast_1', 'ast_2'] });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.scenes.map((s) => [s.role, s.visual.type, s.visual.asset_id])).toEqual([
      ['hook', 'ai_image', null],
      ['demo', 'image', 'ast_1'],
      ['benefit', 'image', 'ast_2'],
      ['cta', 'ai_image', null],
    ]);
  });

  it('không có ảnh sản phẩm thì bỏ cảnh demo/proof', () => {
    const r = buildDraftSpec({ ...base, productImageIds: [] });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.scenes.map((s) => s.role)).toEqual(['hook', 'benefit', 'cta']);
    expect(r.value.scenes.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('LLM trả rác thì báo lỗi, không ném', () => {
    expect(buildDraftSpec({ ...base, llmText: 'xin lỗi tôi không làm được', productImageIds: [] }).ok).toBe(false);
    expect(buildDraftSpec({ ...base, llmText: '{"scenes": []}', productImageIds: [] }).ok).toBe(false);
    expect(() => extractJson('không có json')).toThrow();
  });
});
