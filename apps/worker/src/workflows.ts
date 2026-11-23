/**
 * Workflow chạy trong sandbox của Temporal: phải deterministic, KHÔNG I/O trực tiếp.
 * Chỉ import giá trị từ '@temporalio/workflow' và '@affilio/core/temporal/shared'; còn lại dùng `import type`.
 */
import { ActivityFailure, CancellationScope, proxyActivities, sleep, type RetryPolicy } from '@temporalio/workflow';
import { TASK_QUEUES, type VideoDraftInput, type VideoRenderFinalInput, type VideoReviseInput } from '@affilio/core/temporal/shared';
import type { Activities } from '#src/activities.ts';

/** Giữ nguyên chính sách cũ của hàng đợi Postgres: 30s·2^n, tối đa 30 phút, 3 lần thử. */
const RETRY: RetryPolicy = { initialInterval: '30s', backoffCoefficient: 2, maximumInterval: '30m', maximumAttempts: 3 };

const llm = proxyActivities<Activities>({ taskQueue: TASK_QUEUES.llm, startToCloseTimeout: '5m', retry: RETRY });
const render = proxyActivities<Activities>({
  taskQueue: TASK_QUEUES.render,
  startToCloseTimeout: '30m',
  // Worker chết giữa chừng thì sau 2 phút không heartbeat Temporal giao lại cho worker khác.
  heartbeatTimeout: '2m',
  retry: RETRY,
});
/** Chạy trên task queue của workflow; chỉ ghi DB nên thử nhiều lần. */
const local = proxyActivities<Activities>({ startToCloseTimeout: '30s', retry: { maximumAttempts: 10 } });

export type DraftWorkflowResult =
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'rejected_auto'; versionId: string }
  | { outcome: 'pending_review'; versionId: string }
  | { outcome: 'preview_skipped'; versionId: string; reason: string };

export type ReviseWorkflowResult =
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'pending_review'; versionId: string }
  | { outcome: 'preview_skipped'; versionId: string; reason: string };

export type RenderFinalWorkflowResult = { outcome: 'ready' } | { outcome: 'skipped'; reason: string };

function failureMessage(err: unknown): string {
  if (err instanceof ActivityFailure && err.cause) return err.cause.message;
  return err instanceof Error ? err.message : String(err);
}

/** Hết lượt thử (hoặc bị huỷ) → đưa video về failed, kể cả khi workflow đang bị cancel. */
async function failVideo(videoId: string, step: string, err: unknown): Promise<void> {
  await CancellationScope.nonCancellable(() => local.markVideoFailed({ videoId, step, reason: failureMessage(err) }));
}

/** Viết nháp → kiểm tra luật cứng → (đạt) dựng preview → chờ duyệt. */
export async function videoDraftWorkflow(input: VideoDraftInput): Promise<DraftWorkflowResult> {
  let step = 'drafting';
  try {
    for (;;) {
      const draft = await llm.draftVideo(input);
      if (draft.kind === 'deferred') {
        // Hết hạn mức ngày: ngủ tới lúc reset rồi viết lại, không tính vào lượt thử.
        await sleep(Math.max(0, Date.parse(draft.retryAt) - Date.now()));
        continue;
      }
      if (draft.kind === 'skipped') return { outcome: 'skipped', reason: draft.reason };
      if (!draft.passed) return { outcome: 'rejected_auto', versionId: draft.versionId };

      step = 'previewing';
      const preview = await render.renderPreview({ ...input, versionId: draft.versionId });
      return preview.kind === 'done'
        ? { outcome: 'pending_review', versionId: draft.versionId }
        : { outcome: 'preview_skipped', versionId: draft.versionId, reason: preview.reason };
    }
  } catch (err) {
    await failVideo(input.videoId, step, err);
    throw err;
  }
}

/** Render bản cuối sau khi duyệt. */
export async function videoRenderFinalWorkflow(input: VideoRenderFinalInput): Promise<RenderFinalWorkflowResult> {
  try {
    const result = await render.renderFinal(input);
    return result.kind === 'done' ? { outcome: 'ready' } : { outcome: 'skipped', reason: result.reason };
  } catch (err) {
    await failVideo(input.videoId, 'rendering', err);
    throw err;
  }
}

/** AI sửa một cảnh → dựng preview cho phiên bản mới → quay lại hộp duyệt. */
export async function videoReviseWorkflow(input: VideoReviseInput): Promise<ReviseWorkflowResult> {
  let step = 'revising';
  try {
    for (;;) {
      const revised = await llm.reviseScene(input);
      if (revised.kind === 'deferred') {
        // Hết hạn mức ngày: ngủ tới lúc reset rồi thử lại, không tính vào lượt thử.
        await sleep(Math.max(0, Date.parse(revised.retryAt) - Date.now()));
        continue;
      }
      if (revised.kind === 'skipped') return { outcome: 'skipped', reason: revised.reason };

      step = 'previewing';
      const preview = await render.renderPreview({ workspaceId: input.workspaceId, videoId: input.videoId, versionId: revised.versionId });
      return preview.kind === 'done'
        ? { outcome: 'pending_review', versionId: revised.versionId }
        : { outcome: 'preview_skipped', versionId: revised.versionId, reason: preview.reason };
    }
  } catch (err) {
    await failVideo(input.videoId, step, err);
    throw err;
  }
}
