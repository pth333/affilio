import {
  applyScenePatch,
  callProvider,
  checkHardRules,
  createVersion,
  enqueue,
  eq,
  extractJson,
  JOB_TYPES,
  newId,
  product,
  productImageIds,
  transitionVideo,
  video,
  videoCheck,
  videoVersion,
} from '@affilio/core';
import { z } from 'zod';
import type { JobHandler } from '#src/types.ts';
import { revisePayloadSchema } from '#src/handlers/payload.ts';

const REVISE_SYSTEM_PROMPT = [
  'Bạn viết lại đúng MỘT cảnh trong kịch bản video ngắn bán hàng affiliate tiếng Việt.',
  'Giữ nguyên vai trò cảnh, chỉ sửa lời thoại cho tự nhiên, đúng chỉ dẫn và không cam kết quá đà.',
  'Trả về DUY NHẤT JSON: {"narration":"..."} — 1 đến 2 câu, tối đa 400 ký tự.',
].join('\n');

const revisedSceneSchema = z.object({ narration: z.string().trim().min(1).max(400) });

/** Gợi ý cho LLM: sản phẩm, vai trò cảnh, lời thoại hiện tại và chỉ dẫn của người duyệt. */
function buildRevisePrompt(input: { productName: string; role: string; narration: string; instruction?: string | null }): string {
  return [
    `Sản phẩm: ${input.productName}`,
    `Vai trò cảnh: ${input.role}`,
    `Lời thoại hiện tại: ${input.narration}`,
    input.instruction ? `Yêu cầu của người duyệt: ${input.instruction}` : 'Yêu cầu: viết lại tự nhiên và hấp dẫn hơn, giữ nguyên ý.',
  ].join('\n');
}

/**
 * Nhờ AI sửa một cảnh: needs_changes → revising → auto_check → previewing.
 * Job được defer khi hết hạn mức; video ở trạng thái revising cho tới khi chạy lại.
 * Luật cứng chỉ ghi nhận để người duyệt thấy, không tự đá video ra khỏi hộp duyệt.
 */
export const reviseHandler: JobHandler = {
  queue: 'llm',
  step: 'revising',
  async run({ job, deps, log, signal }) {
    const { db, providers } = deps;
    const { videoId, versionId, sceneId, instruction } = revisePayloadSchema.parse(job.payload);

    const [row] = await db
      .select({ video, product })
      .from(video)
      .innerJoin(product, eq(product.id, video.productId))
      .where(eq(video.id, videoId));
    if (!row) {
      log.warn({ videoId }, 'video không còn tồn tại, bỏ job');
      return { kind: 'done' };
    }
    if (row.video.currentVersionId !== versionId || (row.video.status !== 'needs_changes' && row.video.status !== 'revising')) {
      log.warn({ status: row.video.status, versionId }, 'bản đã đổi hoặc không còn chờ AI sửa, bỏ job');
      return { kind: 'done' };
    }

    const [version] = await db.select().from(videoVersion).where(eq(videoVersion.id, versionId));
    const scene = version?.spec.scenes.find((item) => item.id === sceneId);
    if (!version || !scene) {
      log.warn({ versionId, sceneId }, 'không tìm thấy cảnh cần sửa, bỏ job');
      return { kind: 'done' };
    }

    if (row.video.status === 'needs_changes') {
      const moved = await transitionVideo(db, { videoId, from: ['needs_changes'], to: 'revising' });
      if (!moved) {
        log.warn('trạng thái video vừa đổi, bỏ job');
        return { kind: 'done' };
      }
    }

    const request = {
      system: REVISE_SYSTEM_PROMPT,
      prompt: buildRevisePrompt({ productName: row.product.name, role: scene.role, narration: scene.narration, instruction }),
      maxTokens: 300,
      temperature: 0.5,
    };
    const llm = providers.llm;
    const outcome = await callProvider(
      db,
      {
        workspaceId: job.workspaceId,
        purpose: 'revise',
        provider: llm.provider,
        model: llm.model,
        estUnits: llm.estimateUnits(request),
        dailyLimit: providers.dailyLimits[llm.provider],
        jobId: job.id,
        videoId,
        prompt: request.prompt,
      },
      () => llm.complete(request, signal),
      (text) => text,
    );
    if (!outcome.ok) return { kind: 'defer', runAfter: outcome.retryAt, reason: 'hết hạn mức AI trong ngày' };

    const parsed = revisedSceneSchema.safeParse(extractJson(outcome.value));
    if (!parsed.success) throw new Error('AI không trả về lời thoại cảnh hợp lệ');
    const patched = applyScenePatch(
      version.spec,
      { ops: [{ op: 'update', sceneId, changes: { narration: parsed.data.narration } }] },
      { kind: 'ai', targetSceneIds: [sceneId] },
    );
    if (!patched.ok) throw new Error(`cảnh AI sửa không hợp lệ: ${patched.errors.join('; ')}`);

    const images = await productImageIds(db, job.workspaceId, row.product.id);
    const rules = checkHardRules(patched.value, { affiliateUrl: row.product.affiliateUrl, productAssetIds: images });

    const newVersionId = await db.transaction(async (tx) => {
      const created = await createVersion(tx, {
        videoId,
        spec: patched.value,
        source: 'ai_revise',
        parentVersionId: versionId,
        changeSummary: `AI sửa cảnh ${sceneId}`,
      });
      await transitionVideo(tx, { videoId, from: ['revising'], to: 'auto_check' });
      await tx.insert(videoCheck).values({
        id: newId('videoCheck'),
        videoVersionId: created.id,
        rules,
        passed: rules.every((rule) => rule.passed),
      });
      await transitionVideo(tx, { videoId, from: ['auto_check'], to: 'previewing' });
      await enqueue(tx, {
        workspaceId: job.workspaceId,
        queue: 'render',
        type: JOB_TYPES.renderPreview,
        payload: { videoId, versionId: created.id },
        videoId,
        idempotencyKey: `${JOB_TYPES.renderPreview}:${created.id}`,
      });
      return created.id;
    });

    log.info({ newVersionId, sceneId, passed: rules.every((rule) => rule.passed) }, 'AI đã sửa cảnh, chờ render preview');
    return { kind: 'done' };
  },
};
