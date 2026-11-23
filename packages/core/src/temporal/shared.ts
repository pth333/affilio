/**
 * Hằng số + kiểu dùng chung giữa API/CLI (start workflow) và worker (workflow + activity).
 * File này KHÔNG được import gì có side effect / Node API: nó bị bundle vào sandbox workflow.
 */

/** Task queue: workflow chạy ở `video`, activity tách theo loại tài nguyên để giới hạn đồng thời riêng. */
export const TASK_QUEUES = {
  video: 'vm-video',
  llm: 'vm-llm',
  render: 'vm-render',
} as const;

/** Tên workflow type — phải trùng tên hàm export trong apps/worker/src/workflows.ts. */
export const WORKFLOW_TYPES = {
  draft: 'videoDraftWorkflow',
  renderFinal: 'videoRenderFinalWorkflow',
} as const;

export interface VideoDraftInput {
  workspaceId: string;
  videoId: string;
}

export interface VideoRenderFinalInput {
  workspaceId: string;
  videoId: string;
  versionId: string;
}

/** Workflow ID cố định theo đối tượng ⇒ start trùng không chạy hai lần (thay idempotency_key của bảng jobs). */
export function draftWorkflowId(videoId: string): string {
  return `video.draft:${videoId}`;
}

export function renderFinalWorkflowId(versionId: string): string {
  return `video.render_final:${versionId}`;
}
