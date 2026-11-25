import { fileURLToPath } from 'node:url';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { TASK_QUEUES, WORKFLOW_TYPES } from '@affilio/core/temporal/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Activities } from '#src/activities.ts';
import type { DraftResult, MarkFailedInput, MarkScriptFailedInput, RenderResult, ReviseResult, ScriptResult } from '#src/types.ts';

const WORKFLOWS_PATH = fileURLToPath(new URL('./workflows.ts', import.meta.url));
const INPUT = { workspaceId: 'ws_1', videoId: 'vid_1' };
const SCRIPT_INPUT = { workspaceId: 'ws_1', scriptId: 'scr_1' };

let env: TestWorkflowEnvironment;

beforeAll(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
}, 120_000);

afterAll(async () => {
  await env?.teardown();
});

interface Mocks {
  draftScript?: () => Promise<ScriptResult>;
  draftVideo?: () => Promise<DraftResult>;
  reviseScene?: () => Promise<ReviseResult>;
  renderPreview?: () => Promise<RenderResult>;
  renderFinal?: () => Promise<RenderResult>;
}

/** Activity giả; time-skipping nên backoff retry thật (30s·2^n) không làm test chậm. */
function fakeActivities(mocks: Mocks) {
  const markVideoFailed = vi.fn<(input: MarkFailedInput) => Promise<void>>(async () => undefined);
  const markScriptFailed = vi.fn<(input: MarkScriptFailedInput) => Promise<void>>(async () => undefined);
  const draftScript = vi.fn(mocks.draftScript ?? (async (): Promise<ScriptResult> => ({ kind: 'scripted', versionId: 'ver_s1' })));
  const draftVideo = vi.fn(mocks.draftVideo ?? (async (): Promise<DraftResult> => ({ kind: 'drafted', versionId: 'ver_1', passed: true })));
  const reviseScene = vi.fn(mocks.reviseScene ?? (async (): Promise<ReviseResult> => ({ kind: 'revised', versionId: 'ver_r1' })));
  const renderPreview = vi.fn(mocks.renderPreview ?? (async (): Promise<RenderResult> => ({ kind: 'done' })));
  const renderFinal = vi.fn(mocks.renderFinal ?? (async (): Promise<RenderResult> => ({ kind: 'done' })));
  const activities: Activities = { draftScript, draftVideo, reviseScene, renderPreview, renderFinal, markVideoFailed, markScriptFailed };
  return { activities, draftScript, draftVideo, reviseScene, renderPreview, renderFinal, markVideoFailed, markScriptFailed };
}

/** Chạy 3 worker (video/llm/render) như main.ts rồi thực thi workflow. */
async function runWorkflow(workflowType: string, args: unknown[], activities: Activities): Promise<unknown> {
  const { client, nativeConnection } = env;
  const workers = await Promise.all([
    Worker.create({ connection: nativeConnection, taskQueue: TASK_QUEUES.video, workflowsPath: WORKFLOWS_PATH, activities }),
    Worker.create({ connection: nativeConnection, taskQueue: TASK_QUEUES.llm, activities }),
    Worker.create({ connection: nativeConnection, taskQueue: TASK_QUEUES.render, activities }),
  ]);
  const [video, llm, render] = workers;
  return video.runUntil(
    llm.runUntil(
      render.runUntil(
        client.workflow.execute(workflowType, { taskQueue: TASK_QUEUES.video, workflowId: `test-${crypto.randomUUID()}`, args }),
      ),
    ),
  );
}

describe('scriptWriteWorkflow', () => {
  it('AI viết kịch bản → ready, không tạo/dựng video', async () => {
    const m = fakeActivities({});
    const result = await runWorkflow(WORKFLOW_TYPES.scriptWrite, [SCRIPT_INPUT], m.activities);
    expect(result).toEqual({ outcome: 'ready', versionId: 'ver_s1' });
    expect(m.draftVideo).not.toHaveBeenCalled();
    expect(m.renderPreview).not.toHaveBeenCalled();
  }, 60_000);

  it('hết hạn mức → ngủ tới retryAt rồi viết lại', async () => {
    let calls = 0;
    const m = fakeActivities({
      draftScript: async () => {
        calls += 1;
        if (calls === 1) return { kind: 'deferred', retryAt: new Date(Date.now() + 6 * 3600_000).toISOString() };
        return { kind: 'scripted', versionId: 'ver_s2' };
      },
    });
    const result = await runWorkflow(WORKFLOW_TYPES.scriptWrite, [SCRIPT_INPUT], m.activities);
    expect(result).toEqual({ outcome: 'ready', versionId: 'ver_s2' });
    expect(m.draftScript).toHaveBeenCalledTimes(2);
  }, 60_000);

  it('kịch bản không còn hợp lệ → skipped', async () => {
    const m = fakeActivities({ draftScript: async () => ({ kind: 'skipped', reason: 'kịch bản đang ở trạng thái archived' }) });
    const result = await runWorkflow(WORKFLOW_TYPES.scriptWrite, [SCRIPT_INPUT], m.activities);
    expect(result).toEqual({ outcome: 'skipped', reason: 'kịch bản đang ở trạng thái archived' });
  }, 60_000);

  it('AI lỗi hết lượt thử → đánh dấu kịch bản failed', async () => {
    const m = fakeActivities({
      draftScript: async () => {
        throw new Error('API LLM sập');
      },
    });
    await expect(runWorkflow(WORKFLOW_TYPES.scriptWrite, [SCRIPT_INPUT], m.activities)).rejects.toThrow();
    expect(m.draftScript).toHaveBeenCalledTimes(3);
    expect(m.markScriptFailed).toHaveBeenCalledWith({ scriptId: 'scr_1', reason: 'API LLM sập' });
    expect(m.markVideoFailed).not.toHaveBeenCalled();
  }, 60_000);
});

describe('videoDraftWorkflow', () => {
  it('viết nháp đạt → dựng preview → chờ duyệt', async () => {
    const m = fakeActivities({});
    const result = await runWorkflow(WORKFLOW_TYPES.draft, [INPUT], m.activities);
    expect(result).toEqual({ outcome: 'pending_review', versionId: 'ver_1' });
    expect(m.renderPreview).toHaveBeenCalledWith({ ...INPUT, versionId: 'ver_1' });
    expect(m.markVideoFailed).not.toHaveBeenCalled();
  }, 60_000);

  it('không đạt luật cứng → rejected_auto, không dựng preview', async () => {
    const m = fakeActivities({ draftVideo: async () => ({ kind: 'drafted', versionId: 'ver_2', passed: false }) });
    const result = await runWorkflow(WORKFLOW_TYPES.draft, [INPUT], m.activities);
    expect(result).toEqual({ outcome: 'rejected_auto', versionId: 'ver_2' });
    expect(m.renderPreview).not.toHaveBeenCalled();
  }, 60_000);

  it('hết hạn mức → ngủ tới retryAt rồi viết lại', async () => {
    let calls = 0;
    const m = fakeActivities({
      draftVideo: async () => {
        calls += 1;
        if (calls === 1) return { kind: 'deferred', retryAt: new Date(Date.now() + 6 * 3600_000).toISOString() };
        return { kind: 'drafted', versionId: 'ver_3', passed: true };
      },
    });
    const result = await runWorkflow(WORKFLOW_TYPES.draft, [INPUT], m.activities);
    expect(result).toEqual({ outcome: 'pending_review', versionId: 'ver_3' });
    expect(m.draftVideo).toHaveBeenCalledTimes(2);
  }, 60_000);

  it('video không còn hợp lệ → skipped', async () => {
    const m = fakeActivities({ draftVideo: async () => ({ kind: 'skipped', reason: 'video không còn tồn tại' }) });
    const result = await runWorkflow(WORKFLOW_TYPES.draft, [INPUT], m.activities);
    expect(result).toEqual({ outcome: 'skipped', reason: 'video không còn tồn tại' });
  }, 60_000);

  it('preview lỗi hết lượt thử → đánh dấu failed ở bước previewing', async () => {
    const m = fakeActivities({
      renderPreview: async () => {
        throw new Error('ffmpeg hỏng');
      },
    });
    await expect(runWorkflow(WORKFLOW_TYPES.draft, [INPUT], m.activities)).rejects.toThrow();
    // Chính sách retry thật: 3 lần thử.
    expect(m.renderPreview).toHaveBeenCalledTimes(3);
    expect(m.markVideoFailed).toHaveBeenCalledWith({ videoId: 'vid_1', step: 'previewing', reason: 'ffmpeg hỏng' });
  }, 60_000);
});

describe('videoRenderFinalWorkflow', () => {
  const input = { ...INPUT, versionId: 'ver_1' };

  it('render xong → ready', async () => {
    const m = fakeActivities({});
    expect(await runWorkflow(WORKFLOW_TYPES.renderFinal, [input], m.activities)).toEqual({ outcome: 'ready' });
  }, 60_000);

  it('lỗi hết lượt thử → đánh dấu failed ở bước rendering', async () => {
    const m = fakeActivities({
      renderFinal: async () => {
        throw new Error('hết dung lượng');
      },
    });
    await expect(runWorkflow(WORKFLOW_TYPES.renderFinal, [input], m.activities)).rejects.toThrow();
    expect(m.markVideoFailed).toHaveBeenCalledWith({ videoId: 'vid_1', step: 'rendering', reason: 'hết dung lượng' });
  }, 60_000);
});

describe('videoReviseWorkflow', () => {
  const input = { ...INPUT, versionId: 'ver_1', sceneId: 'sc_1', instruction: null };

  it('AI sửa cảnh → dựng preview bản mới → chờ duyệt', async () => {
    const m = fakeActivities({});
    const result = await runWorkflow(WORKFLOW_TYPES.revise, [input], m.activities);
    expect(result).toEqual({ outcome: 'pending_review', versionId: 'ver_r1' });
    expect(m.renderPreview).toHaveBeenCalledWith({ ...INPUT, versionId: 'ver_r1' });
  }, 60_000);

  it('hết hạn mức → ngủ tới retryAt rồi sửa lại', async () => {
    let calls = 0;
    const m = fakeActivities({
      reviseScene: async () => {
        calls += 1;
        if (calls === 1) return { kind: 'deferred', retryAt: new Date(Date.now() + 6 * 3600_000).toISOString() };
        return { kind: 'revised', versionId: 'ver_r2' };
      },
    });
    const result = await runWorkflow(WORKFLOW_TYPES.revise, [input], m.activities);
    expect(result).toEqual({ outcome: 'pending_review', versionId: 'ver_r2' });
    expect(m.reviseScene).toHaveBeenCalledTimes(2);
  }, 60_000);

  it('bản đã đổi → skipped, không dựng preview', async () => {
    const m = fakeActivities({ reviseScene: async () => ({ kind: 'skipped', reason: 'bản đã đổi' }) });
    const result = await runWorkflow(WORKFLOW_TYPES.revise, [input], m.activities);
    expect(result).toEqual({ outcome: 'skipped', reason: 'bản đã đổi' });
    expect(m.renderPreview).not.toHaveBeenCalled();
  }, 60_000);

  it('AI lỗi hết lượt thử → đánh dấu failed ở bước revising', async () => {
    const m = fakeActivities({
      reviseScene: async () => {
        throw new Error('AI trả JSON hỏng');
      },
    });
    await expect(runWorkflow(WORKFLOW_TYPES.revise, [input], m.activities)).rejects.toThrow();
    expect(m.markVideoFailed).toHaveBeenCalledWith({ videoId: 'vid_1', step: 'revising', reason: 'AI trả JSON hỏng' });
  }, 60_000);
});
