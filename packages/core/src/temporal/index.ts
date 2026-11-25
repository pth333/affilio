import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import {
  draftWorkflowId,
  renderFinalWorkflowId,
  reviseWorkflowId,
  scriptWriteWorkflowId,
  TASK_QUEUES,
  WORKFLOW_TYPES,
  type VideoDraftInput,
  type VideoRenderFinalInput,
  type VideoReviseInput,
  type ScriptWriteInput,
} from '#src/temporal/shared.ts';

export * from '#src/temporal/shared.ts';
export { Client as TemporalClient } from '@temporalio/client';

export interface TemporalHandle {
  client: Client;
  close: () => Promise<void>;
}

/** Kết nối Temporal cho API/CLI (worker dùng NativeConnection riêng). */
export async function createTemporalClient(config: { TEMPORAL_ADDRESS: string; TEMPORAL_NAMESPACE: string }): Promise<TemporalHandle> {
  const connection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
  const client = new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
  return { client, close: () => connection.close() };
}

export interface StartedWorkflow {
  workflowId: string;
  /** null = workflow cùng ID đã chạy xong thành công nên không chạy lại. */
  runId: string | null;
}

/**
 * Start idempotent theo workflow ID:
 * - đang chạy → dùng lại (USE_EXISTING)
 * - đã xong thành công → không chạy lại; đã thất bại → cho chạy lại (ALLOW_DUPLICATE_FAILED_ONLY)
 */
async function startOnce(client: Client, workflowType: string, workflowId: string, input: VideoDraftInput | VideoRenderFinalInput | VideoReviseInput | ScriptWriteInput): Promise<StartedWorkflow> {
  try {
    const handle = await client.workflow.start(workflowType, {
      taskQueue: TASK_QUEUES.video,
      workflowId,
      args: [input],
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE_FAILED_ONLY',
    });
    return { workflowId, runId: handle.firstExecutionRunId };
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) return { workflowId, runId: null };
    throw err;
  }
}

export function startDraftWorkflow(client: Client, input: VideoDraftInput): Promise<StartedWorkflow> {
  return startOnce(client, WORKFLOW_TYPES.draft, draftWorkflowId(input.videoId), input);
}

export function startRenderFinalWorkflow(client: Client, input: VideoRenderFinalInput): Promise<StartedWorkflow> {
  return startOnce(client, WORKFLOW_TYPES.renderFinal, renderFinalWorkflowId(input.versionId), input);
}

export function startReviseWorkflow(client: Client, input: VideoReviseInput): Promise<StartedWorkflow> {
  return startOnce(client, WORKFLOW_TYPES.revise, reviseWorkflowId(input.versionId, input.sceneId), input);
}

/** `fromVersionId`: phiên bản hiện tại trước khi viết (null = lần đầu) — xem scriptWorkflowId. */
export function startScriptWriteWorkflow(client: Client, input: ScriptWriteInput, fromVersionId: string | null): Promise<StartedWorkflow> {
  return startOnce(client, WORKFLOW_TYPES.scriptWrite, scriptWriteWorkflowId(input.scriptId, fromVersionId), input);
}
