import { z } from 'zod';
import {
  formatZodIssues,
  mascotSchema,
  validateSpec,
  visualSchema,
  voiceSchema,
  type Scene,
  type ValidationResult,
  type VideoSpec,
} from '#src/spec/schema.ts';

/**
 * ScenePatch: sửa theo sceneId (không dùng JSON Patch chuẩn).
 * AI chỉ được sửa cảnh nằm trong mục tiêu và chưa khóa; người sửa tay thì cảnh tự khóa "user_edit".
 */
export const sceneChangesSchema = z
  .object({
    narration: z.string().min(1).max(400),
    duration: z.number().positive().max(30).nullable(),
    voice: voiceSchema,
    visual: visualSchema,
    mascot: mascotSchema.nullable(),
  })
  .partial()
  .strict();

export const scenePatchOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update'), sceneId: z.string().min(1), changes: sceneChangesSchema }),
  z.object({ op: z.literal('move'), sceneId: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal('lock'), sceneId: z.string().min(1), lock: z.enum(['user']).nullable() }),
]);

export const scenePatchSchema = z.object({ ops: z.array(scenePatchOpSchema).min(1).max(50) });

export type SceneChanges = z.infer<typeof sceneChangesSchema>;
export type ScenePatchOp = z.infer<typeof scenePatchOpSchema>;
export type ScenePatch = z.infer<typeof scenePatchSchema>;

export type PatchActor = { kind: 'ai'; targetSceneIds: readonly string[] } | { kind: 'user' };

export function applyScenePatch(spec: VideoSpec, rawPatch: unknown, actor: PatchActor): ValidationResult<VideoSpec> {
  const parsedPatch = scenePatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return { ok: false, errors: formatZodIssues(parsedPatch.error) };

  const scenes: Scene[] = structuredClone(spec.scenes);
  const errors: string[] = [];
  const findIndex = (id: string) => scenes.findIndex((s) => s.id === id);

  for (const op of parsedPatch.data.ops) {
    const idx = findIndex(op.sceneId);
    const scene = scenes[idx];
    if (idx < 0 || !scene) {
      errors.push(`không có cảnh ${op.sceneId}`);
      continue;
    }

    if (actor.kind === 'ai') {
      if (op.op !== 'update') {
        errors.push(`AI chỉ được update, không được ${op.op} (${op.sceneId})`);
        continue;
      }
      if (!actor.targetSceneIds.includes(op.sceneId)) {
        errors.push(`cảnh ${op.sceneId} nằm ngoài mục tiêu sửa`);
        continue;
      }
      if (scene.lock !== null) {
        errors.push(`cảnh ${op.sceneId} đang khóa (${scene.lock})`);
        continue;
      }
    }

    switch (op.op) {
      case 'update': {
        const next: Scene = { ...scene, ...op.changes };
        // Người sửa tay thì tự khóa, trừ khi đã khóa chủ động.
        if (actor.kind === 'user' && scene.lock === null) next.lock = 'user_edit';
        scenes[idx] = next;
        break;
      }
      case 'move': {
        const [moved] = scenes.splice(idx, 1);
        if (moved) scenes.splice(Math.min(op.toIndex, scenes.length), 0, moved);
        break;
      }
      case 'lock': {
        scenes[idx] = { ...scene, lock: op.lock };
        break;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return validateSpec({ ...spec, scenes });
}
