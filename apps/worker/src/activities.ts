import { Context } from '@temporalio/activity';
import {
  applyScenePatch,
  buildDraftPrompt,
  buildDraftSpec,
  buildDraftSystemPrompt,
  callProvider,
  canFinalRender,
  checkHardRules,
  createScriptVersion,
  createVersion,
  eq,
  extractJson,
  loadScript,
  markScriptFailed,
  markVideoFailed,
  newId,
  product,
  productImageIds,
  templateContentFor,
  transitionScript,
  transitionVideo,
  video,
  videoCheck,
  videoVersion,
  type ScriptWriteInput,
  type TemplateContent,
  type VideoDraftInput,
  type VideoRenderFinalInput,
  type VideoReviseInput,
  type VideoSpec,
} from '@affilio/core';
import { z } from 'zod';
import type {
  DraftResult,
  MarkFailedInput,
  MarkScriptFailedInput,
  RenderPreviewInput,
  RenderResult,
  ReviseResult,
  ScriptResult,
  WorkerDeps,
} from '#src/types.ts';

const REVISE_SYSTEM_PROMPT = [
  'Bạn viết lại đúng MỘT cảnh trong kịch bản video ngắn bán hàng affiliate tiếng Việt.',
  'Giữ nguyên vai trò cảnh, chỉ sửa lời thoại cho tự nhiên, đúng chỉ dẫn và không cam kết quá đà.',
  'Trả về DUY NHẤT JSON: {"narration":"..."} — 1 đến 2 câu, tối đa 400 ký tự.',
].join('\n');

const revisedSceneSchema = z.object({ narration: z.string().trim().min(1).max(400) });

/** Gợi ý cho LLM: sản phẩm, vai trò cảnh, lời thoại hiện tại và chỉ dẫn của người duyệt. */
function buildRevisePrompt(input: { productName: string; role: string; narration: string; instruction: string | null }): string {
  return [
    `Sản phẩm: ${input.productName}`,
    `Vai trò cảnh: ${input.role}`,
    `Lời thoại hiện tại: ${input.narration}`,
    input.instruction ? `Yêu cầu của người duyệt: ${input.instruction}` : 'Yêu cầu: viết lại tự nhiên và hấp dẫn hơn, giữ nguyên ý.',
  ].join('\n');
}

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

  /**
   * Gọi AI viết kịch bản theo template rồi ghép thành spec hợp lệ.
   * Hết hạn mức ngày → trả `deferred` để workflow ngủ tới lúc reset; kịch bản hỏng → ném lỗi để Temporal thử lại.
   */
  async function generateSpec(input: {
    workspaceId: string;
    /** Có khi AI viết thẳng cho video (CLI); viết kịch bản thì không gắn video. */
    videoId?: string | undefined;
    product: { id: string; name: string; description: string | null; category: string | null };
    template: { id: string; version: number } | undefined;
    content: TemplateContent;
    images: readonly string[];
  }): Promise<{ kind: 'deferred'; retryAt: string } | { kind: 'spec'; spec: VideoSpec }> {
    const ctx = Context.current();
    const { content } = input;
    const request = { system: buildDraftSystemPrompt(content), prompt: buildDraftPrompt(input.product), maxTokens: 800 };
    const llm = providers.llm;
    const outcome = await callProvider(
      db,
      {
        workspaceId: input.workspaceId,
        purpose: 'script',
        provider: llm.provider,
        model: llm.model,
        estUnits: llm.estimateUnits(request),
        dailyLimit: providers.dailyLimits[llm.provider],
        jobId: ctx.info.workflowExecution?.workflowId ?? ctx.info.activityId,
        ...(input.videoId ? { videoId: input.videoId } : {}),
        prompt: request.prompt,
      },
      () => llm.complete(request, ctx.cancellationSignal),
      (text) => text,
    );
    if (!outcome.ok) {
      activityLog().warn({ retryAt: outcome.retryAt }, 'hết hạn mức AI trong ngày, dời lại');
      return { kind: 'deferred', retryAt: outcome.retryAt.toISOString() };
    }

    const built = buildDraftSpec({
      llmText: outcome.value,
      productId: input.product.id,
      productImageIds: input.images,
      voice: content.voice,
      roles: content.scenes.map((scene) => scene.role),
      ...(input.template ? { template: input.template } : {}),
    });
    if (!built.ok) throw new Error(`kịch bản LLM không hợp lệ: ${built.errors.join('; ')}`);
    return { kind: 'spec', spec: built.value };
  }

  return {
    /**
     * AI viết (hoặc viết lại) một kịch bản trong thư viện: writing → ready, ghi `script_version` kèm kết quả kiểm luật.
     * Không tạo video; người dùng xem/sửa rồi bấm "Tạo video" khi muốn.
     */
    async draftScript({ workspaceId, scriptId }: ScriptWriteInput): Promise<ScriptResult> {
      const log = activityLog();
      const found = await loadScript(db, workspaceId, scriptId);
      if (!found) return { kind: 'skipped', reason: 'kịch bản không còn tồn tại' };
      const { script } = found;

      // Lần thử trước đã commit xong nhưng chết trước khi báo về Temporal → trả lại đúng kết quả cũ.
      // (Viết lại luôn chuyển về `writing` trước khi start, nên `ready` ở đây chỉ có thể là kết quả của lần này.)
      if (script.status === 'ready' && script.currentVersionId) return { kind: 'scripted', versionId: script.currentVersionId };
      if (script.status !== 'writing') return { kind: 'skipped', reason: `kịch bản đang ở trạng thái ${script.status}` };

      const [p] = await db.select().from(product).where(eq(product.id, script.productId));
      if (!p) return { kind: 'skipped', reason: 'sản phẩm không còn tồn tại' };

      const content = await templateContentFor(db, workspaceId, script.templateId);
      const images = await productImageIds(db, workspaceId, p.id);
      const generated = await generateSpec({
        workspaceId,
        product: p,
        template: script.templateId ? { id: script.templateId, version: script.templateVersion ?? 1 } : undefined,
        content,
        images,
      });
      if (generated.kind === 'deferred') return generated;
      const spec = generated.spec;

      // Luật cứng chỉ ghi nhận để người dùng thấy và sửa; chặn ở bước tạo video.
      const rules = checkHardRules(spec, { affiliateUrl: p.affiliateUrl, productAssetIds: images });
      const versionId = await db.transaction(async (tx) => {
        const version = await createScriptVersion(tx, {
          scriptId,
          spec,
          source: 'ai_draft',
          rules,
          parentVersionId: script.currentVersionId,
          changeSummary: script.currentVersionId ? 'AI viết lại kịch bản' : 'kịch bản AI',
        });
        const moved = await transitionScript(tx, { scriptId, from: ['writing'], to: 'ready' });
        if (!moved) throw new Error('trạng thái kịch bản vừa đổi trong lúc lưu');
        return version.id;
      });

      log.info({ scriptId, versionId, failedRules: rules.filter((r) => !r.passed).map((r) => r.rule) }, 'AI đã viết xong kịch bản');
      return { kind: 'scripted', versionId };
    },

    /**
     * AI viết + dựng nháp (CLI): queued → drafting → auto_check → previewing | rejected_auto (mục 4 plan v4).
     * Kịch bản người dùng đã xác nhận (`versionId`): video đã ở auto_check từ lúc confirm → previewing.
     */
    async draftVideo({ workspaceId, videoId, versionId: confirmedVersionId }: VideoDraftInput): Promise<DraftResult> {
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
      if (confirmedVersionId) {
        if (row.video.status !== 'auto_check') return { kind: 'skipped', reason: `video đang ở trạng thái ${row.video.status}` };
      } else if (row.video.status !== 'drafting') {
        const moved = await transitionVideo(db, { videoId, from: ['queued', 'failed'], to: 'drafting' });
        if (!moved) return { kind: 'skipped', reason: `video đang ở trạng thái ${row.video.status}` };
      }

      const content = await templateContentFor(db, workspaceId, row.video.templateId);
      const images = await productImageIds(db, workspaceId, row.product.id);

      // Hai đường vào: phiên bản người dùng đã xác nhận, hoặc AI viết mới hoàn toàn (luồng CLI).
      let spec: VideoSpec;
      if (confirmedVersionId) {
        const [confirmed] = await db.select().from(videoVersion).where(eq(videoVersion.id, confirmedVersionId));
        if (!confirmed || confirmed.videoId !== videoId) {
          return { kind: 'skipped', reason: `không tìm thấy phiên bản ${confirmedVersionId} của video` };
        }
        spec = confirmed.spec;
      } else {
        const generated = await generateSpec({
          workspaceId,
          videoId,
          product: row.product,
          template: row.video.templateId ? { id: row.video.templateId, version: row.video.templateVersion ?? 1 } : undefined,
          content,
          images,
        });
        if (generated.kind === 'deferred') return generated;
        spec = generated.spec;
      }

      const rules = checkHardRules(spec, { affiliateUrl: row.product.affiliateUrl, productAssetIds: images });
      const passed = rules.every((rule) => rule.passed);
      // Kịch bản người dùng đã duyệt: chỉ ghi nhận luật cứng để họ thấy, không tự loại khỏi hộp duyệt.
      const approved = Boolean(confirmedVersionId);
      const nextStatus = approved || passed ? 'previewing' : 'rejected_auto';

      const versionId = await db.transaction(async (tx) => {
        // Phiên bản đã xác nhận thì giữ nguyên, không sinh thêm phiên bản trùng nội dung.
        let id = confirmedVersionId;
        if (!id) {
          const version = await createVersion(tx, {
            videoId,
            spec,
            source: 'ai_draft',
            changeSummary: 'bản nháp AI',
          });
          id = version.id;
        }
        if (!confirmedVersionId) await transitionVideo(tx, { videoId, from: ['drafting'], to: 'auto_check' });
        await tx.insert(videoCheck).values({ id: newId('videoCheck'), videoVersionId: id, rules, passed });
        await transitionVideo(tx, { videoId, from: ['auto_check'], to: nextStatus });
        return id;
      });

      log.info(
        { versionId, passed, approved, failedRules: rules.filter((r) => !r.passed).map((r) => r.rule) },
        'đã lưu kịch bản',
      );
      return { kind: 'drafted', versionId, passed };
    },

    /**
     * Nhờ AI sửa một cảnh: needs_changes → revising → auto_check → previewing.
     * Luật cứng chỉ ghi nhận để người duyệt thấy, không tự đá video ra khỏi hộp duyệt.
     */
    async reviseScene({ workspaceId, videoId, versionId, sceneId, instruction }: VideoReviseInput): Promise<ReviseResult> {
      const ctx = Context.current();
      const log = activityLog();
      const [row] = await db
        .select({ video, product })
        .from(video)
        .innerJoin(product, eq(product.id, video.productId))
        .where(eq(video.id, videoId));
      if (!row) return { kind: 'skipped', reason: 'video không còn tồn tại' };

      // Lần thử trước đã commit phiên bản mới (parent = versionId) nhưng chết trước khi báo về → trả lại kết quả cũ.
      if (row.video.status === 'previewing' && row.video.currentVersionId) {
        const [current] = await db
          .select({ parentVersionId: videoVersion.parentVersionId })
          .from(videoVersion)
          .where(eq(videoVersion.id, row.video.currentVersionId));
        if (current?.parentVersionId === versionId) return { kind: 'revised', versionId: row.video.currentVersionId };
      }
      if (row.video.currentVersionId !== versionId || (row.video.status !== 'needs_changes' && row.video.status !== 'revising')) {
        return { kind: 'skipped', reason: `bản đã đổi hoặc không còn chờ AI sửa (trạng thái ${row.video.status})` };
      }

      const [version] = await db.select().from(videoVersion).where(eq(videoVersion.id, versionId));
      const scene = version?.spec.scenes.find((item) => item.id === sceneId);
      if (!version || !scene) return { kind: 'skipped', reason: `không tìm thấy cảnh ${sceneId}` };

      if (row.video.status === 'needs_changes') {
        const moved = await transitionVideo(db, { videoId, from: ['needs_changes'], to: 'revising' });
        if (!moved) return { kind: 'skipped', reason: 'trạng thái video vừa đổi' };
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
          workspaceId,
          purpose: 'revise',
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

      const parsed = revisedSceneSchema.safeParse(extractJson(outcome.value));
      if (!parsed.success) throw new Error('AI không trả về lời thoại cảnh hợp lệ');
      const patched = applyScenePatch(
        version.spec,
        { ops: [{ op: 'update', sceneId, changes: { narration: parsed.data.narration } }] },
        { kind: 'ai', targetSceneIds: [sceneId] },
      );
      if (!patched.ok) throw new Error(`cảnh AI sửa không hợp lệ: ${patched.errors.join('; ')}`);

      const images = await productImageIds(db, workspaceId, row.product.id);
      const rules = checkHardRules(patched.value, { affiliateUrl: row.product.affiliateUrl, productAssetIds: images });
      const passed = rules.every((rule) => rule.passed);

      const newVersionId = await db.transaction(async (tx) => {
        const created = await createVersion(tx, {
          videoId,
          spec: patched.value,
          source: 'ai_revise',
          parentVersionId: versionId,
          changeSummary: `AI sửa cảnh ${sceneId}`,
        });
        await transitionVideo(tx, { videoId, from: ['revising'], to: 'auto_check' });
        await tx.insert(videoCheck).values({ id: newId('videoCheck'), videoVersionId: created.id, rules, passed });
        await transitionVideo(tx, { videoId, from: ['auto_check'], to: 'previewing' });
        return created.id;
      });

      log.info({ newVersionId, sceneId, passed }, 'AI đã sửa cảnh, chờ render preview');
      return { kind: 'revised', versionId: newVersionId };
    },

    /**
     * Bộ khung: mới chuyển trạng thái. Render thật bằng FFmpeg (ảnh + zoompan + TTS + mascot,
     * cache theo sceneHash) làm ở M1 với các helper trong @affilio/core/render — nhớ gọi heartbeat theo tiến độ.
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
    async markScriptFailed({ scriptId, reason }: MarkScriptFailedInput): Promise<void> {
      await markScriptFailed(db, scriptId, reason);
      activityLog().error({ scriptId, reason }, 'AI viết kịch bản thất bại');
    },

    async markVideoFailed({ videoId, step, reason }: MarkFailedInput): Promise<void> {
      await markVideoFailed(db, videoId, step, reason);
      activityLog().error({ videoId, step, reason }, 'video thất bại');
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
