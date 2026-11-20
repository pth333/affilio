import { validateSpec, type VideoSpec, type VideoSpecInput } from '#src/spec/schema.ts';

const voice = { provider: 'stub', name: 'vi-female', rate: 1 };

/** Spec hợp lệ tối thiểu: hook (ảnh AI) → demo (ảnh thật) → cta (ảnh thật). */
export function specInput(): VideoSpecInput {
  return {
    schema: 4,
    product_id: 'prd_1',
    template: { id: 'default', version: 1 },
    cta: { enabled: true },
    music: null,
    scenes: [
      {
        id: 's1',
        role: 'hook',
        narration: 'Bạn có biết chiếc bình giữ nhiệt này giữ đá suốt 24 giờ không?',
        voice,
        visual: { type: 'ai_image', prompt: 'ice cubes in a steel bottle', asset_id: null },
      },
      {
        id: 's2',
        role: 'demo',
        narration: 'Mình đổ đá từ sáng, tới tối vẫn còn nguyên, nắp vặn kín không rỉ nước.',
        voice,
        visual: { type: 'image', asset_id: 'ast_1', motion: 'zoom_in' },
      },
      {
        id: 's3',
        role: 'cta',
        narration: 'Link mua mình để ở dưới video nhé, đang có giảm giá đó.',
        voice,
        visual: { type: 'image', asset_id: 'ast_2' },
      },
    ],
  };
}

export function validSpec(): VideoSpec {
  const r = validateSpec(specInput());
  if (!r.ok) throw new Error(`fixture spec không hợp lệ: ${r.errors.join('; ')}`);
  return r.value;
}
