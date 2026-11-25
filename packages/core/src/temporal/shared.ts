/**
 * Hằng số + kiểu dùng chung giữa API/CLI (start workflow) và worker (workflow + activity).
 * File này KHÔNG được import gì có side effect / Node API: nó bị bundle vào sandbox workflow.
 */

/** Task queue: workflow chạy ở `video`, activity tách theo loại tài nguyên để giới hạn đồng thời riêng. */
export const TASK_QUEUES = {
  video: 'affilio-video',
  llm: 'affilio-llm',
  render: 'affilio-render',
} as const;

/** Tên workflow type — phải trùng tên hàm export trong apps/worker/src/workflows.ts. */
export const WORKFLOW_TYPES = {
  draft: 'videoDraftWorkflow',
  renderFinal: 'videoRenderFinalWorkflow',
  revise: 'videoReviseWorkflow',
  scriptWrite: 'scriptWriteWorkflow',
} as const;

export interface VideoDraftInput {
  workspaceId: string;
  videoId: string;
  /**
   * Phiên bản video đã có sẵn spec (video tạo từ kịch bản).
   * Có thì activity dùng spec của phiên bản này, không gọi AI và không tạo phiên bản mới.
   */
  versionId?: string;
}

/** AI viết (hoặc viết lại) một kịch bản trong thư viện kịch bản. */
export interface ScriptWriteInput {
  workspaceId: string;
  scriptId: string;
}

export interface VideoRenderFinalInput {
  workspaceId: string;
  videoId: string;
  versionId: string;
}

/** AI viết lại một cảnh của phiên bản đang chờ duyệt. */
export interface VideoReviseInput {
  workspaceId: string;
  videoId: string;
  versionId: string;
  sceneId: string;
  instruction: string | null;
}

/** Workflow ID cố định theo đối tượng ⇒ start trùng không chạy hai lần (thay idempotency_key của bảng jobs). */
export function draftWorkflowId(videoId: string): string {
  return `video.draft:${videoId}`;
}

export function renderFinalWorkflowId(versionId: string): string {
  return `video.render_final:${versionId}`;
}

/**
 * Mỗi lần viết kịch bản gắn với phiên bản đang có (`initial` khi chưa có):
 * bấm trùng thì dùng lại workflow, còn "AI viết lại" từ bản mới thì ra ID mới.
 */
export function scriptWriteWorkflowId(scriptId: string, fromVersionId: string | null): string {
  return `script.write:${scriptId}:${fromVersionId ?? 'initial'}`;
}

export function reviseWorkflowId(versionId: string, sceneId: string): string {
  return `video.revise:${versionId}:${sceneId}`;
}
