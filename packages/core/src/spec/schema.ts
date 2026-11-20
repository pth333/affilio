import { z } from 'zod';

/**
 * Đặc tả video (mục 7 plan v4). Chỉ chứa thứ cần để render; id/version/workspace,
 * điểm chấm, ghi chú nằm ở bảng riêng. Lưu ở video_version.spec.
 */
export const SPEC_SCHEMA_VERSION = 4 as const;

export const SCENE_ROLES = ['hook', 'intro', 'problem', 'benefit', 'demo', 'proof', 'compare', 'cta'] as const;
export type SceneRole = (typeof SCENE_ROLES)[number];

/** Cảnh chỉ được dùng ảnh sản phẩm thật, không mascot, không ảnh/clip AI. */
export const REAL_ONLY_ROLES: readonly SceneRole[] = ['demo', 'proof'];
/** Clip AI chỉ cho các vai trò này. */
export const AI_CLIP_ROLES: readonly SceneRole[] = ['hook', 'intro', 'problem'];

export const MOTIONS = ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right'] as const;
export type Motion = (typeof MOTIONS)[number];

export const VISUAL_TYPES = ['image', 'ai_image', 'ai_clip'] as const;
export const SCENE_LOCKS = ['user', 'user_edit'] as const;
export const MASCOT_ACTIONS = ['enter', 'wave', 'point', 'surprised', 'think', 'happy', 'shake_head', 'idle'] as const;
export const MASCOT_POSITIONS = ['right_mid', 'left_mid'] as const;

export const voiceSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1),
  rate: z.number().min(0.5).max(2).default(1),
  delivery: z.string().optional(),
});

export const visualSchema = z.object({
  type: z.enum(VISUAL_TYPES),
  /** Prompt tiếng Anh, chỉ cho ai_image/ai_clip. */
  prompt: z.string().min(1).optional(),
  asset_id: z.string().nullable(),
  motion: z.enum(MOTIONS).default('static'),
});

export const mascotSchema = z
  .object({
    mascot_id: z.string().min(1),
    action: z.enum(MASCOT_ACTIONS),
    position: z.enum(MASCOT_POSITIONS),
    from: z.number().min(0),
    to: z.number().positive(),
  })
  .refine((m) => m.to > m.from, { message: 'mascot.to phải lớn hơn mascot.from' });

export const sceneSchema = z.object({
  id: z.string().min(1),
  role: z.enum(SCENE_ROLES),
  lock: z.enum(SCENE_LOCKS).nullable().default(null),
  narration: z.string().min(1).max(400),
  /** null = lấy theo độ dài file TTS. */
  duration: z.number().positive().max(30).nullable().default(null),
  voice: voiceSchema,
  visual: visualSchema,
  mascot: mascotSchema.nullable().optional(),
});

export const videoSpecSchema = z
  .object({
    schema: z.literal(SPEC_SCHEMA_VERSION),
    product_id: z.string().min(1),
    template: z.object({
      id: z.string().min(1),
      version: z.number().int().positive(),
      angle: z.string().optional(),
    }),
    cta: z.object({ enabled: z.boolean() }),
    music: z.object({ asset_id: z.string().min(1), volume: z.number().min(0).max(1) }).nullable().optional(),
    scenes: z.array(sceneSchema).min(1).max(20),
  })
  .superRefine((spec, ctx) => {
    const seen = new Set<string>();
    spec.scenes.forEach((scene, i) => {
      const path = ['scenes', i];
      if (seen.has(scene.id)) ctx.addIssue({ code: 'custom', path: [...path, 'id'], message: `trùng scene id ${scene.id}` });
      seen.add(scene.id);

      if (scene.visual.type === 'image' && !scene.visual.asset_id) {
        ctx.addIssue({ code: 'custom', path: [...path, 'visual', 'asset_id'], message: 'cảnh ảnh sản phẩm phải có asset_id' });
      }
      if (scene.visual.type !== 'image' && !scene.visual.prompt) {
        ctx.addIssue({ code: 'custom', path: [...path, 'visual', 'prompt'], message: 'ảnh/clip AI phải có prompt' });
      }
      if (REAL_ONLY_ROLES.includes(scene.role)) {
        if (scene.visual.type !== 'image') {
          ctx.addIssue({ code: 'custom', path: [...path, 'visual', 'type'], message: `cảnh ${scene.role} chỉ dùng ảnh sản phẩm thật` });
        }
        if (scene.mascot) {
          ctx.addIssue({ code: 'custom', path: [...path, 'mascot'], message: `cảnh ${scene.role} không dùng mascot` });
        }
      }
      if (scene.visual.type === 'ai_clip' && !AI_CLIP_ROLES.includes(scene.role)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'visual', 'type'], message: `clip AI không dùng cho cảnh ${scene.role}` });
      }
    });
  });

export type Voice = z.infer<typeof voiceSchema>;
export type Visual = z.infer<typeof visualSchema>;
export type Mascot = z.infer<typeof mascotSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type VideoSpec = z.infer<typeof videoSpecSchema>;
export type VideoSpecInput = z.input<typeof videoSpecSchema>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export function validateSpec(input: unknown): ValidationResult<VideoSpec> {
  const parsed = videoSpecSchema.safeParse(input);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, errors: formatZodIssues(parsed.error) };
}

/** Tính ra, không lưu: có cảnh ai_image hoặc ai_clip. */
export function usesAi(spec: VideoSpec): boolean {
  return spec.scenes.some((s) => s.visual.type !== 'image');
}

/** Ước tính thời lượng khi chưa có TTS (~15 ký tự/giây cho tiếng Việt). */
export const CHARS_PER_SECOND = 15;

export function estimateSceneDuration(scene: Scene): number {
  if (scene.duration !== null) return scene.duration;
  return Math.max(1.5, scene.narration.length / CHARS_PER_SECOND / scene.voice.rate);
}

export function estimateTotalDuration(spec: VideoSpec): number {
  return spec.scenes.reduce((sum, s) => sum + estimateSceneDuration(s), 0);
}
