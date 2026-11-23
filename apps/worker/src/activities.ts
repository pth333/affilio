import { Context } from '@temporalio/activity';
import {
  buildDraftPrompt,
  buildDraftSpec,
  callProvider,
  canFinalRender,
  checkHardRules,
  createVersion,
  DRAFT_SYSTEM_PROMPT,
  eq,
  markVideoFailed,
  newId,
  product,
  productImageIds,
  transitionVideo,
  video,
  videoCheck,
  type VideoDraftInput,
  type VideoRenderFinalInput,
} from '@vm/core';
import type { DraftResult, MarkFailedInput, RenderPreviewInput, RenderResult, WorkerDeps } from '#src/types.ts';

/** Giọng mặc định cho đến khi có template (M2). */
const DEFAULT_VOICE = { provider: 'edge', name: 'vi-VN-HoaiMyNeural' } as const;

/**
 * Activity = phần có I/O (DB, LLM, FFmpeg). Temporal tự retry khi activity ném lỗi,
 * nên mỗi activity phải idempotent: chạy lại sau khi đã xong một phần không được làm hỏng dữ liệu.
 */
export function createActivities(deps: WorkerDeps) {
  const { db, providers } = deps;

  function activityLog() {
    const info = Context.current().info;
    return deps.logger.child({ workflowId: info.workflowExecution?.workflowId, activity: info.activityType, attempt: info.attempt });
  }

  return {
    /** queued → drafting → auto_check → previewing | rejected_auto (mục 4 plan v4). */
    async draftVideo({ workspaceId, videoId }: VideoDraftInput): Promise<DraftResult> {
      const ctx = Context.current();
      const log = activityLog();
      const [row] = await db
        .select({ video, product })
        .from(video)
        .innerJoin(product, eq(product.id, video.productId))
        .where(eq(video.id, videoId));
      if (!row) return { kind: 'skipped', reason: 'video không còn tồn tại' };

      // Lần thử trước đã commit xong nhưng chết trước khi báo về Temporal → trả lại đúng kết quả cũ.
      const done = row.video.currentVersionId;
      if (done && (row.video.status === 'previewing' || row.video.status === 'rejected_auto')) {
        return { kind: 'drafted', versionId: done, passed: row.video.status === 'previewing' };
      }
      if (row.video.status !== 'drafting') {
        const moved = await transitionVideo(db, { videoId, from: ['queued', 'failed'], to: 'drafting' });
        if (!moved) return { kind: 'skipped', reason: `video đang ở trạng thái ${row.video.status}` };
      }

      const request = { system: DRAFT_SYSTEM_PROMPT, prompt: buildDraftPrompt(row.product), maxTokens: 800 };
      const llm = providers.llm;
      const outcome = await callProvider(
        db,
        {
          workspaceId,
          purpose: 'script',
          provider: llm.provider,
          model: llm.model,
          estUnits: llm.estimateUnits(request),
          dailyLimit: providers.dailyLimits[llm.provider],
          jobId: ctx.info.workflowExecution?.workflowId ?? ctx.info.activityId,
          videoId,
          prompt: request.prompt,
        },
        () => llm.complete(request, ctx.cancellationSignal),
        (text) => text,
      );
      if (!outcome.ok) {
        log.warn({ retryAt: outcome.retryAt }, 'hết hạn mức AI trong ngày, dời lại');
        return { kind: 'deferred', retryAt: outcome.retryAt.toISOString() };
      }

      const images = await productImageIds(db, workspaceId, row.product.id);
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
        return version.id;
      });

      log.info({ versionId, passed, failedRules: rules.filter((r) => !r.passed).map((r) => r.rule) }, 'đã viết nháp');
      return { kind: 'drafted', versionId, passed };
    },

    /**
     * Bộ khung: mới chuyển trạng thái. Render thật bằng FFmpeg (ảnh + zoompan + TTS + mascot,
     * cache theo sceneHash) làm ở M1 với các helper trong @vm/core/render — nhớ gọi heartbeat theo tiến độ.
     */
    async renderPreview({ videoId, versionId }: RenderPreviewInput): Promise<RenderResult> {
      Context.current().heartbeat();
      const log = activityLog();
      const [v] = await db.select().from(video).where(eq(video.id, videoId));
      if (!v || v.status !== 'previewing' || v.currentVersionId !== versionId) {
        return { kind: 'skipped', reason: `preview không còn cần (trạng thái ${v?.status ?? 'không còn video'})` };
      }
      // TODO(M1): render preview 540p vào storage, ghi bảng render + asset.
      await transitionVideo(db, { videoId, from: ['previewing'], to: 'pending_review' });
      log.info({ versionId }, 'preview xong (stub), chờ duyệt');
      return { kind: 'done' };
    },

    async renderFinal({ videoId, versionId }: VideoRenderFinalInput): Promise<RenderResult> {
      Context.current().heartbeat();
      const log = activityLog();
      const [v] = await db.select().from(video).where(eq(video.id, videoId));
      if (!v) return { kind: 'skipped', reason: 'video không còn tồn tại' };
      // Cổng duyệt: chỉ render đúng bản đã duyệt và đang là bản hiện tại.
      if (v.status === 'approved' && !canFinalRender(v)) {
        return { kind: 'skipped', reason: 'bản hiện tại chưa được duyệt' };
      }
      if (v.status !== 'approved' && v.status !== 'rendering') {
        return { kind: 'skipped', reason: `video đang ở trạng thái ${v.status}` };
      }
      if (v.status === 'approved') await transitionVideo(db, { videoId, from: ['approved'], to: 'rendering' });
      // TODO(M1): render bản cuối 1080p, ghi asset kind=render.
      await transitionVideo(db, { videoId, from: ['rendering'], to: 'ready' });
      log.info({ versionId }, 'render cuối xong (stub)');
      return { kind: 'done' };
    },

    /** Workflow gọi khi activity đã hết lượt thử: đưa video về failed để người dùng thấy và làm lại. */
    async markVideoFailed({ videoId, step, reason }: MarkFailedInput): Promise<void> {
      await markVideoFailed(db, videoId, step, reason);
      activityLog().error({ videoId, step, reason }, 'video thất bại');
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
