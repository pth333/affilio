import {
  buildDraftPrompt,
  buildDraftSpec,
  callProvider,
  checkHardRules,
  createVersion,
  DRAFT_SYSTEM_PROMPT,
  enqueue,
  eq,
  JOB_TYPES,
  newId,
  product,
  productImageIds,
  transitionVideo,
  video,
  videoCheck,
} from '@affilio/core';
import type { JobHandler } from '#src/types.ts';
import { videoPayloadSchema } from '#src/handlers/payload.ts';

/** Giọng mặc định cho đến khi có template (M2). */
const DEFAULT_VOICE = { provider: 'edge', name: 'vi-VN-HoaiMyNeural' } as const;

/** queued → drafting → auto_check → previewing | rejected_auto (mục 4 plan v4). */
export const draftHandler: JobHandler = {
  queue: 'llm',
  step: 'drafting',
  async run({ job, deps, log, signal }) {
    const { db, providers } = deps;
    const { videoId } = videoPayloadSchema.parse(job.payload);
    const [row] = await db
      .select({ video, product })
      .from(video)
      .innerJoin(product, eq(product.id, video.productId))
      .where(eq(video.id, videoId));
    if (!row) {
      log.warn({ videoId }, 'video không còn tồn tại, bỏ job');
      return { kind: 'done' };
    }
    if (row.video.status !== 'drafting') {
      const moved = await transitionVideo(db, { videoId, from: ['queued', 'failed'], to: 'drafting' });
      if (!moved) {
        log.warn({ status: row.video.status }, 'video không ở trạng thái viết nháp được, bỏ job');
        return { kind: 'done' };
      }
    }

    const request = { system: DRAFT_SYSTEM_PROMPT, prompt: buildDraftPrompt(row.product), maxTokens: 800 };
    const llm = providers.llm;
    const outcome = await callProvider(
      db,
      {
        workspaceId: job.workspaceId,
        purpose: 'script',
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

    const images = await productImageIds(db, job.workspaceId, row.product.id);
    const built = buildDraftSpec({ llmText: outcome.value, productId: row.product.id, productImageIds: images, voice: DEFAULT_VOICE });
    if (!built.ok) throw new Error(`kịch bản LLM không hợp lệ: ${built.errors.join('; ')}`);
    const spec = built.value;

    const rules = checkHardRules(spec, { affiliateUrl: row.product.affiliateUrl, productAssetIds: images });
    const passed = rules.every((r) => r.passed);

    const versionId = await db.transaction(async (tx) => {
      const version = await createVersion(tx, { videoId, spec, source: 'ai_draft', changeSummary: 'bản nháp AI' });
      await transitionVideo(tx, { videoId, from: ['drafting'], to: 'auto_check' });
      await tx.insert(videoCheck).values({ id: newId('videoCheck'), videoVersionId: version.id, rules, passed });
      await transitionVideo(tx, { videoId, from: ['auto_check'], to: passed ? 'previewing' : 'rejected_auto' });
      if (passed) {
        await enqueue(tx, {
          workspaceId: job.workspaceId,
          queue: 'render',
          type: JOB_TYPES.renderPreview,
          payload: { videoId, versionId: version.id },
          videoId,
          idempotencyKey: `${JOB_TYPES.renderPreview}:${version.id}`,
        });
      }
      return version.id;
    });

    log.info({ versionId, passed, failedRules: rules.filter((r) => !r.passed).map((r) => r.rule) }, 'đã viết nháp');
    return { kind: 'done' };
  },
};
