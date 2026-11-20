import { describe, expect, it } from 'vitest';
import { specInput, validSpec } from '#src/test/fixtures.ts';
import { sha256, specHash, stableStringify } from '#src/spec/hash.ts';
import { applyScenePatch } from '#src/spec/patch.ts';
import { allPassed, checkHardRules } from '#src/spec/rules.ts';
import { estimateSceneDuration, usesAi, validateSpec } from '#src/spec/schema.ts';

describe('validateSpec', () => {
  it('nhận spec hợp lệ và điền giá trị mặc định', () => {
    const spec = validSpec();
    expect(spec.scenes[0]?.lock).toBeNull();
    expect(spec.scenes[2]?.visual.motion).toBe('static');
    expect(usesAi(spec)).toBe(true);
  });

  it('chặn cảnh demo dùng ảnh AI', () => {
    const input = specInput();
    const demo = input.scenes[1];
    if (!demo) throw new Error('thiếu cảnh demo');
    demo.visual = { type: 'ai_image', prompt: 'x', asset_id: null };
    const r = validateSpec(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toContain('chỉ dùng ảnh sản phẩm thật');
  });

  it('chặn trùng scene id và clip AI sai vai trò', () => {
    const input = specInput();
    const [s1, , s3] = input.scenes;
    if (!s1 || !s3) throw new Error('thiếu cảnh');
    s3.id = s1.id;
    s3.visual = { type: 'ai_clip', prompt: 'x', asset_id: null };
    const r = validateSpec(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('trùng scene id'))).toBe(true);
      expect(r.errors.some((e) => e.includes('clip AI không dùng cho cảnh cta'))).toBe(true);
    }
  });

  it('ước tính thời lượng theo số ký tự, tối thiểu 1.5s', () => {
    const scene = validSpec().scenes[0];
    if (!scene) throw new Error('thiếu cảnh');
    expect(estimateSceneDuration({ ...scene, narration: 'a' })).toBe(1.5);
    expect(estimateSceneDuration({ ...scene, duration: 4 })).toBe(4);
  });
});

describe('hash', () => {
  it('stableStringify không phụ thuộc thứ tự khóa và bỏ undefined', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('specHash đổi khi nội dung đổi', () => {
    const a = validSpec();
    expect(specHash(a)).toBe(specHash(validSpec()));
    expect(specHash({ ...a, cta: { enabled: false } })).not.toBe(specHash(a));
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('applyScenePatch', () => {
  it('người sửa tay thì cảnh tự khóa user_edit', () => {
    const r = applyScenePatch(validSpec(), { ops: [{ op: 'update', sceneId: 's1', changes: { narration: 'Mở đầu mới.' } }] }, { kind: 'user' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.scenes[0]?.narration).toBe('Mở đầu mới.');
      expect(r.value.scenes[0]?.lock).toBe('user_edit');
    }
  });

  it('AI không được sửa cảnh khóa, ngoài mục tiêu, hay move', () => {
    const locked = applyScenePatch(validSpec(), { ops: [{ op: 'lock', sceneId: 's1', lock: 'user' }] }, { kind: 'user' });
    if (!locked.ok) throw new Error(locked.errors.join('; '));
    const r = applyScenePatch(
      locked.value,
      {
        ops: [
          { op: 'update', sceneId: 's1', changes: { narration: 'x' } },
          { op: 'update', sceneId: 's3', changes: { narration: 'x' } },
          { op: 'move', sceneId: 's1', toIndex: 2 },
        ],
      },
      { kind: 'ai', targetSceneIds: ['s1'] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(3);
      expect(r.errors[0]).toContain('đang khóa');
      expect(r.errors[1]).toContain('ngoài mục tiêu');
      expect(r.errors[2]).toContain('chỉ được update');
    }
  });

  it('move đổi vị trí cảnh; patch sai cấu trúc bị từ chối', () => {
    const r = applyScenePatch(validSpec(), { ops: [{ op: 'move', sceneId: 's3', toIndex: 0 }] }, { kind: 'user' });
    expect(r.ok && r.value.scenes.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
    const bad = applyScenePatch(validSpec(), { ops: [{ op: 'update', sceneId: 's1', changes: { role: 'cta' } }] }, { kind: 'user' });
    expect(bad.ok).toBe(false);
  });
});

describe('checkHardRules', () => {
  it('spec chuẩn qua hết luật', () => {
    const results = checkHardRules(validSpec(), { affiliateUrl: 'https://shope.ee/abc', productAssetIds: ['ast_1', 'ast_2'] });
    expect(allPassed(results)).toBe(true);
    expect(results.find((r) => r.rule === 'ai_label')?.message).toContain('nhãn nội dung AI');
  });

  it('bắt link sai, cụm cam kết quá đà, ảnh không thuộc sản phẩm', () => {
    const spec = validSpec();
    const s1 = spec.scenes[0];
    if (!s1) throw new Error('thiếu cảnh');
    s1.narration = 'Cam kết 100% giữ lạnh!';
    const results = checkHardRules(spec, { affiliateUrl: 'javascript:alert(1)', productAssetIds: ['ast_1'] });
    const failed = results.filter((r) => !r.passed).map((r) => r.rule);
    expect(failed).toEqual(expect.arrayContaining(['affiliate_link', 'no_overclaim', 'product_image_owner']));
  });

  it('bắt thời lượng ngoài khoảng cho phép', () => {
    const spec = validSpec();
    spec.scenes = spec.scenes.map((s) => ({ ...s, duration: 1 }));
    const r = checkHardRules(spec, { affiliateUrl: 'https://x.vn' }).find((x) => x.rule === 'duration_range');
    expect(r?.passed).toBe(false);
  });
});
