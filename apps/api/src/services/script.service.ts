import {
  archiveScript,
  createManualScript,
  createVideoFromScript,
  loadScript,
  regenerateAiScript,
  requestAiScripts,
  templateContentFor,
  updateScript,
  type AiScriptItem,
  type Db,
  type RuleResult,
  type Script,
  type ScriptFailure,
  type ScriptVersion,
  type TemplateContent,
  type TemporalClient,
} from '@affilio/core';
import {
  countScriptVideos,
  findProductName,
  listScripts,
  type ScriptListItem,
} from '#src/repositories/script.repository.ts';
import type { Video } from '#src/repositories/video.repository.ts';
import { resolveTemplate } from '#src/services/video.service.ts';
import { AppError, conflict, notFound, toPage, type Page } from '#src/shared.ts';
import type { ScriptListQuery } from '#src/schemas.ts';

/**
 * Tầng nghiệp vụ của thư viện kịch bản: gọi `@affilio/core` (dùng chung với worker) và đổi lỗi sang HTTP.
 */

/** Đổi lỗi thao tác kịch bản của core thành HTTP: không thấy → 404, dữ liệu sai → 400 (kèm luật chưa qua), còn lại 409. */
function scriptError(failure: ScriptFailure): AppError {
  if (failure.reason === 'not_found') return notFound(failure.message);
  if (failure.reason === 'invalid') {
    const issues = failure.rules?.filter((r) => !r.passed).map((r) => ({ path: r.rule, message: r.message ?? r.rule }));
    return new AppError(400, 'Bad Request', failure.message, issues);
  }
  return conflict(failure.message);
}

export async function listScriptPage(db: Db, params: ScriptListQuery & { workspaceId: string }): Promise<Page<ScriptListItem>> {
  const rows = await listScripts(db, params);
  return toPage(rows, params.limit);
}

export interface ScriptDetail {
  script: Script;
  productName: string | null;
  /** null khi AI chưa viết xong lần đầu. */
  version: ScriptVersion | null;
  rules: RuleResult[];
  /** Khung cảnh của template (role + gợi ý) để trình soạn hiện đúng thứ tự cảnh. */
  template: TemplateContent;
  videoCount: number;
}

export async function getScriptDetail(db: Db, params: { workspaceId: string; scriptId: string }): Promise<ScriptDetail> {
  const found = await loadScript(db, params.workspaceId, params.scriptId);
  if (!found) throw notFound('Không tìm thấy kịch bản');
  const { script, version } = found;
  const [productName, template, videoCount] = await Promise.all([
    findProductName(db, { workspaceId: params.workspaceId, productId: script.productId }),
    templateContentFor(db, params.workspaceId, script.templateId),
    countScriptVideos(db, script.id),
  ]);
  return { script, productName, version, rules: version?.rules ?? [], template, videoCount };
}

export interface RequestAiScriptsParams {
  workspaceId: string;
  userId: string;
  productIds: string[];
  templateId: string;
}

/** Giao worker viết kịch bản cho nhiều sản phẩm; trả về ngay, không chờ AI. */
export async function requestAiScriptBatch(
  db: Db,
  temporal: TemporalClient,
  params: RequestAiScriptsParams,
): Promise<{ items: AiScriptItem[] }> {
  const template = await resolveTemplate(db, params.workspaceId, params.templateId);
  const items = await requestAiScripts(db, temporal, {
    workspaceId: params.workspaceId,
    userId: params.userId,
    productIds: params.productIds,
    template,
  });
  if (items.length === 0) throw notFound('Không tìm thấy sản phẩm nào');
  return { items };
}

export interface CreateManualScriptParams {
  workspaceId: string;
  userId: string;
  productId: string;
  templateId: string;
  narrations: string[];
}

export async function createManual(db: Db, params: CreateManualScriptParams): Promise<Script> {
  const template = await resolveTemplate(db, params.workspaceId, params.templateId);
  const result = await createManualScript(db, { ...params, template });
  if (!result.ok) throw scriptError(result);
  return result.script;
}

export interface UpdateScriptParams {
  workspaceId: string;
  userId: string;
  scriptId: string;
  versionId: string;
  narrations: string[];
}

export async function saveScript(db: Db, params: UpdateScriptParams): Promise<{ script: Script; versionId: string }> {
  const result = await updateScript(db, params);
  if (!result.ok) throw scriptError(result);
  return { script: result.script, versionId: result.versionId };
}

export interface ScriptActionParams {
  workspaceId: string;
  userId: string;
  scriptId: string;
}

export async function regenerate(
  db: Db,
  temporal: TemporalClient,
  params: ScriptActionParams,
): Promise<{ script: Script; workflowId: string }> {
  const result = await regenerateAiScript(db, temporal, params);
  if (!result.ok) throw scriptError(result);
  return { script: result.script, workflowId: result.workflowId };
}

export async function archive(db: Db, params: ScriptActionParams): Promise<Script> {
  const result = await archiveScript(db, params);
  if (!result.ok) throw scriptError(result);
  return result.script;
}

export async function createVideo(
  db: Db,
  temporal: TemporalClient,
  params: ScriptActionParams & { versionId: string },
): Promise<{ video: Video; workflowId: string }> {
  const result = await createVideoFromScript(db, temporal, params);
  if (!result.ok) throw scriptError(result);
  return { video: result.video, workflowId: result.workflowId };
}
