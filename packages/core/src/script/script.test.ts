import { describe, expect, it } from 'vitest';
import { mergeNarrations } from '#src/script/index.ts';
import { validSpec } from '#src/test/fixtures.ts';
import { assembleSpec } from '#src/video/draft.ts';

describe('assembleSpec (kịch bản tự viết)', () => {
  const base = { productId: 'prd_1', voice: { provider: 'stub', name: 'vi' } };
  const scenes = [
    { role: 'hook', narration: '  Bạn đã thử bình giữ nhiệt này chưa?  ' },
    { role: 'demo', narration: 'Đổ đá từ sáng tới tối vẫn còn.' },
    { role: 'cta', narration: 'Link mua ở dưới video nhé.' },
  ] as const;

  it('cảnh không có prompt dùng ảnh sản phẩm xoay vòng, lời thoại được trim', () => {
    const r = assembleSpec({ ...base, productImageIds: ['ast_1', 'ast_2'], scenes });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.scenes.map((s) => [s.role, s.visual.type, s.visual.asset_id])).toEqual([
      ['hook', 'image', 'ast_1'],
      ['demo', 'image', 'ast_2'],
      ['cta', 'image', 'ast_1'],
    ]);
    expect(r.value.scenes[0]?.narration).toBe('Bạn đã thử bình giữ nhiệt này chưa?');
  });

  it('sản phẩm chưa có ảnh: bỏ cảnh demo, cảnh khác dùng ảnh AI', () => {
    const r = assembleSpec({ ...base, productImageIds: [], scenes });
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(r.value.scenes.map((s) => [s.id, s.role, s.visual.type])).toEqual([
      ['s1', 'hook', 'ai_image'],
      ['s2', 'cta', 'ai_image'],
    ]);
  });

  it('lời thoại rỗng thì spec không hợp lệ', () => {
    const r = assembleSpec({ ...base, productImageIds: ['ast_1'], scenes: [{ role: 'hook', narration: '   ' }] });
    expect(r.ok).toBe(false);
  });
});

describe('mergeNarrations (sửa kịch bản)', () => {
  it('chỉ đổi lời thoại cảnh bị sửa, khóa user_edit, giữ nguyên hình ảnh', () => {
    const spec = validSpec();
    const narrations = spec.scenes.map((s) => s.narration);
    narrations[1] = '  Lời thoại mới cho cảnh demo.  ';
    const r = mergeNarrations(spec, narrations);
    if (!r.ok) throw new Error(r.message);
    expect(r.spec.scenes[1]?.narration).toBe('Lời thoại mới cho cảnh demo.');
    expect(r.spec.scenes[1]?.lock).toBe('user_edit');
    expect(r.spec.scenes[1]?.visual).toEqual(spec.scenes[1]?.visual);
    expect(r.spec.scenes[0]).toEqual(spec.scenes[0]);
    expect(r.spec.scenes[2]).toEqual(spec.scenes[2]);
  });

  it('lệch số cảnh hoặc lời thoại rỗng thì báo lỗi', () => {
    const spec = validSpec();
    expect(mergeNarrations(spec, ['một cảnh']).ok).toBe(false);
    expect(mergeNarrations(spec, spec.scenes.map(() => ' ')).ok).toBe(false);
  });
});
