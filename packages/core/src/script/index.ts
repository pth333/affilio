import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import type { Db, Executor, Tx } from '#src/db/index.ts';
import { newId } from '#src/db/id.ts';
import {
  product,
  script,
  scriptVersion,
  video,
  videoVersion,
  type RuleResult,
  type ScriptStatus,
  type ScriptVersionSource,
} from '#src/db/schema.ts';
import { specHash } from '#src/spec/hash.ts';
import { checkHardRules } from '#src/spec/rules.ts';
import { validateSpec, type VideoSpec } from '#src/spec/schema.ts';
import { templateContentFor } from '#src/template/index.ts';
import { startDraftWorkflow, startScriptWriteWorkflow, type TemporalClient } from '#src/temporal/index.ts';
import { assembleSpec, productImageIds } from '#src/video/draft.ts';
import { markVideoFailed, writeAudit, type Video } from '#src/video/index.ts';

export type Script = typeof script.$inferSelect;
export type ScriptVersion = typeof scriptVersion.$inferSelect;

/** Lý do thao tác kịch bản thất bại — tầng service API đổi thành mã HTTP. */
export type ScriptActionFailure = 'not_found' | 'invalid' | 'stale_version' | 'wrong_status';

export type ScriptFailure = { ok: false; reason: ScriptActionFailure; message: string; rules?: RuleResult[] };

/** Độ dài tối đa của lời thoại một cảnh (khớp với giới hạn khi AI sửa cảnh). */
export const SCRIPT_NARRATION_MAX = 400;

function fail(reason: ScriptActionFailure, message: string, rules?: RuleResult[]): ScriptFailure {
  return rules ? { ok: false, reason, message, rules } : { ok: false, reason, message };
}

// ───────────────────────── Phiên bản + kiểm luật ─────────────────────────

export interface CreateScriptVersionInput {
  scriptId: string;
  spec: VideoSpec;
  source: ScriptVersionSource;
  rules: RuleResult[];
  authorUserId?: string | null;
  parentVersionId?: string | null;
  changeSummary?: string | null;
}

/** Thêm phiên bản kịch bản và trỏ current_version_id vào nó. Gọi trong transaction. */
export async function createScriptVersion(tx: Tx, input: CreateScriptVersionInput): Promise<ScriptVersion> {
  // Khóa dòng kịch bản để hai lần lưu đồng thời không lấy trùng version_no.
  await tx.select({ id: script.id }).from(script).where(eq(script.id, input.scriptId)).for('update');
  const [last] = await tx
    .select({ n: max(scriptVersion.versionNo) })
    .from(scriptVersion)
    .where(eq(scriptVersion.scriptId, input.scriptId));
  const [row] = await tx
    .insert(scriptVersion)
    .values({
      id: newId('scriptVersion'),
      scriptId: input.scriptId,
      versionNo: (last?.n ?? 0) + 1,
      parentVersionId: input.parentVersionId ?? null,
      spec: input.spec,
      specHash: specHash(input.spec),
      source: input.source,
      rules: input.rules,
      passed: input.rules.every((r) => r.passed),
      authorUserId: input.authorUserId ?? null,
      changeSummary: input.changeSummary ?? null,
    })
    .returning();
  if (!row) throw new Error('không tạo được script_version');
  await tx.update(script).set({ currentVersionId: row.id, updatedAt: sql`now()` }).where(eq(script.id, input.scriptId));
  return row;
}

/** Kiểm luật cứng với dữ liệu sản phẩm hiện tại (link affiliate, ảnh sản phẩm). */
export async function checkScriptRules(
  db: Executor,
  input: { workspaceId: string; productId: string; spec: VideoSpec },
): Promise<RuleResult[]> {
  const [p] = await db.select({ affiliateUrl: product.affiliateUrl }).from(product).where(eq(product.id, input.productId));
  const images = await productImageIds(db, input.workspaceId, input.productId);
  return checkHardRules(input.spec, { affiliateUrl: p?.affiliateUrl ?? null, productAssetIds: images });
}

/** Kịch bản + phiên bản hiện tại (cho worker và API). */
export async function loadScript(
  db: Executor,
  workspaceId: string,
  scriptId: string,
): Promise<{ script: Script; version: ScriptVersion | null } | null> {
  const [row] = await db
    .select({ script, version: scriptVersion })
    .from(script)
    .leftJoin(scriptVersion, eq(scriptVersion.id, script.currentVersionId))
    .where(and(eq(script.id, scriptId), eq(script.workspaceId, workspaceId)));
  return row ?? null;
}

/** Chuyển trạng thái kịch bản có điều kiện; trả null nếu kịch bản không còn ở trạng thái mong đợi. */
export async function transitionScript(
  db: Executor,
  input: { scriptId: string; from: readonly ScriptStatus[]; to: ScriptStatus; failedReason?: string | null },
): Promise<Script | null> {
  const [row] = await db
    .update(script)
    .set({ status: input.to, failedReason: input.failedReason ?? null, updatedAt: sql`now()` })
    .where(and(eq(script.id, input.scriptId), inArray(script.status, [...input.from])))
    .returning();
  return row ?? null;
}

/** AI viết lỗi hẳn (hết lượt thử): writing → failed. */
export async function markScriptFailed(db: Executor, scriptId: string, reason: string): Promise<void> {
  await transitionScript(db, { scriptId, from: ['writing'], to: 'failed', failedReason: reason.slice(0, 2000) });
}

// ───────────────────────── AI viết kịch bản ─────────────────────────

export interface RequestAiScriptsInput {
  workspaceId: string;
  userId: string | null;
  productIds: readonly string[];
  template?: { id: string; version: number } | undefined;
}

export type AiScriptItem = { script: Script; workflowId: string | null };

/**
 * Tạo kịch bản `writing` cho từng sản phẩm rồi start workflow AI viết trên worker.
 * Sản phẩm không tồn tại/đã lưu trữ bị bỏ qua. Start lỗi → kịch bản `failed` (người dùng bấm "AI viết lại").
 */
export async function requestAiScripts(db: Db, temporal: TemporalClient, input: RequestAiScriptsInput): Promise<AiScriptItem[]> {
  const created = await db.transaction(async (tx) => {
    const rows: Script[] = [];
    for (const productId of new Set(input.productIds)) {
      const [p] = await tx
        .select({ id: product.id })
        .from(product)
        .where(and(eq(product.id, productId), eq(product.workspaceId, input.workspaceId), isNull(product.archivedAt)));
      if (!p) continue;
      const [s] = await tx
        .insert(script)
        .values({
          id: newId('script'),
          workspaceId: input.workspaceId,
          productId,
          templateId: input.template?.id ?? null,
          templateVersion: input.template?.version ?? null,
          origin: 'ai',
          status: 'writing',
          createdBy: input.userId,
        })
        .returning();
      if (!s) throw new Error('không tạo được kịch bản');
      await writeAudit(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: 'script.ai_request',
        targetType: 'script',
        targetId: s.id,
        data: { productId },
      });
      rows.push(s);
    }
    return rows;
  });

  const results = await Promise.allSettled(
    created.map((s) => startScriptWriteWorkflow(temporal, { workspaceId: input.workspaceId, scriptId: s.id }, null)),
  );
  return Promise.all(
    created.map(async (s, i): Promise<AiScriptItem> => {
      const r = results[i];
      if (r?.status === 'fulfilled') return { script: s, workflowId: r.value.workflowId };
      const message = r?.reason instanceof Error ? r.reason.message : String(r?.reason);
      await markScriptFailed(db, s.id, `không start được workflow: ${message}`);
      return { script: { ...s, status: 'failed' }, workflowId: null };
    }),
  );
}

/** AI viết lại kịch bản: ready | failed → writing, workflow mới có ID theo phiên bản nguồn. */
export async function regenerateAiScript(
  db: Db,
  temporal: TemporalClient,
  input: { workspaceId: string; userId: string | null; scriptId: string },
): Promise<{ ok: true; script: Script; workflowId: string } | ScriptFailure> {
  const found = await loadScript(db, input.workspaceId, input.scriptId);
  if (!found) return fail('not_found', 'không tìm thấy kịch bản');
  const moved = await transitionScript(db, { scriptId: input.scriptId, from: ['ready', 'failed'], to: 'writing' });
  if (!moved) return fail('wrong_status', `kịch bản đang ở trạng thái ${found.script.status}, không viết lại được`);
  await writeAudit(db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: 'script.regenerate',
    targetType: 'script',
    targetId: input.scriptId,
    data: { fromVersionId: moved.currentVersionId },
  });

  try {
    const { workflowId } = await startScriptWriteWorkflow(
      temporal,
      { workspaceId: input.workspaceId, scriptId: input.scriptId },
      moved.currentVersionId,
    );
    return { ok: true, script: moved, workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markScriptFailed(db, input.scriptId, `không start được workflow: ${message}`);
    throw new Error(`không start được workflow viết kịch bản ${input.scriptId}`, { cause: err });
  }
}

// ───────────────────────── Người dùng tự viết / sửa ─────────────────────────

export interface CreateManualScriptInput {
  workspaceId: string;
  userId: string | null;
  productId: string;
  template?: { id: string; version: number } | undefined;
  /** Lời thoại theo đúng thứ tự cảnh của template. */
  narrations: readonly string[];
}

/** Người dùng tự viết: khung cảnh theo template, hình ảnh tự gán như AI → kịch bản `ready`. */
export async function createManualScript(db: Db, input: CreateManualScriptInput): Promise<{ ok: true; script: Script } | ScriptFailure> {
  const [p] = await db
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.id, input.productId), eq(product.workspaceId, input.workspaceId), isNull(product.archivedAt)));
  if (!p) return fail('not_found', 'không tìm thấy sản phẩm');

  const content = await templateContentFor(db, input.workspaceId, input.template?.id ?? null);
  if (input.narrations.length !== content.scenes.length) {
    return fail('invalid', `template cần ${content.scenes.length} cảnh nhưng nhận ${input.narrations.length} lời thoại`);
  }
  const images = await productImageIds(db, input.workspaceId, input.productId);
  const built = assembleSpec({
    productId: input.productId,
    productImageIds: images,
    voice: content.voice,
    template: input.template,
    scenes: content.scenes.map((s, i) => ({ role: s.role, narration: input.narrations[i] ?? '', prompt: null })),
  });
  if (!built.ok) return fail('invalid', built.errors.join('; '));
  const spec = built.value;
  const rules = await checkScriptRules(db, { workspaceId: input.workspaceId, productId: input.productId, spec });

  const created = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(script)
      .values({
        id: newId('script'),
        workspaceId: input.workspaceId,
        productId: input.productId,
        templateId: input.template?.id ?? null,
        templateVersion: input.template?.version ?? null,
        origin: 'manual',
        status: 'ready',
        createdBy: input.userId,
      })
      .returning();
    if (!s) throw new Error('không tạo được kịch bản');
    const version = await createScriptVersion(tx, {
      scriptId: s.id,
      spec,
      source: 'user_edit',
      rules,
      authorUserId: input.userId,
      changeSummary: 'người dùng tự viết',
    });
    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: 'script.create_manual',
      targetType: 'script',
      targetId: s.id,
      data: { productId: input.productId },
    });
    return { ...s, currentVersionId: version.id };
  });
  return { ok: true, script: created };
}

/**
 * Ghép lời thoại mới vào spec theo thứ tự cảnh: chỉ đổi `narration`, cảnh bị sửa khóa `user_edit`,
 * giữ nguyên hình ảnh/giọng/mascot. Lệch số cảnh → lỗi.
 */
export function mergeNarrations(spec: VideoSpec, narrations: readonly string[]): { ok: true; spec: VideoSpec } | { ok: false; message: string } {
  if (narrations.length !== spec.scenes.length) {
    return { ok: false, message: `kịch bản có ${spec.scenes.length} cảnh nhưng nhận ${narrations.length} lời thoại` };
  }
  const scenes = spec.scenes.map((scene, i) => {
    const narration = (narrations[i] ?? '').trim();
    return narration === scene.narration ? scene : { ...scene, narration, lock: 'user_edit' as const };
  });
  const validated = validateSpec({ ...spec, scenes });
  if (!validated.ok) return { ok: false, message: validated.errors.join('; ') };
  return { ok: true, spec: validated.value };
}

export interface UpdateScriptInput {
  workspaceId: string;
  userId: string | null;
  scriptId: string;
  /** Phiên bản người dùng đang xem; lệch với bản hiện tại → stale_version (tránh ghi đè giữa 2 tab). */
  versionId: string;
  narrations: readonly string[];
}

/** Lưu lời thoại đã sửa; spec không đổi thì không tạo phiên bản mới. */
export async function updateScript(db: Db, input: UpdateScriptInput): Promise<{ ok: true; script: Script; versionId: string } | ScriptFailure> {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(script)
      .where(and(eq(script.id, input.scriptId), eq(script.workspaceId, input.workspaceId)))
      .for('update');
    if (!s) return fail('not_found', 'không tìm thấy kịch bản');
    if (s.status !== 'ready') return fail('wrong_status', `kịch bản đang ở trạng thái ${s.status}, không sửa được`);
    if (s.currentVersionId !== input.versionId) return fail('stale_version', 'kịch bản đã có phiên bản mới hơn, tải lại để xem');
    const [current] = await tx.select().from(scriptVersion).where(eq(scriptVersion.id, input.versionId));
    if (!current) return fail('not_found', 'không tìm thấy phiên bản kịch bản');

    const merged = mergeNarrations(current.spec, input.narrations);
    if (!merged.ok) return fail('invalid', merged.message);
    if (specHash(merged.spec) === current.specHash) return { ok: true, script: s, versionId: current.id };

    const rules = await checkScriptRules(tx, { workspaceId: input.workspaceId, productId: s.productId, spec: merged.spec });
    const version = await createScriptVersion(tx, {
      scriptId: s.id,
      spec: merged.spec,
      source: 'user_edit',
      rules,
      authorUserId: input.userId,
      parentVersionId: current.id,
      changeSummary: 'người dùng sửa lời thoại',
    });
    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: 'script.edit',
      targetType: 'script',
      targetId: s.id,
      data: { fromVersionId: current.id, versionId: version.id },
    });
    return { ok: true, script: { ...s, currentVersionId: version.id }, versionId: version.id };
  });
}

/** Lưu trữ (ẩn, không xoá vì video có thể tham chiếu): ready | failed → archived. */
export async function archiveScript(
  db: Db,
  input: { workspaceId: string; userId: string | null; scriptId: string },
): Promise<{ ok: true; script: Script } | ScriptFailure> {
  const found = await loadScript(db, input.workspaceId, input.scriptId);
  if (!found) return fail('not_found', 'không tìm thấy kịch bản');
  const moved = await transitionScript(db, { scriptId: input.scriptId, from: ['ready', 'failed'], to: 'archived' });
  if (!moved) return fail('wrong_status', `kịch bản đang ở trạng thái ${found.script.status}, không lưu trữ được`);
  await writeAudit(db, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    action: 'script.archive',
    targetType: 'script',
    targetId: input.scriptId,
  });
  return { ok: true, script: moved };
}

// ───────────────────────── Tạo video từ kịch bản ─────────────────────────

export interface CreateVideoFromScriptInput {
  workspaceId: string;
  userId: string | null;
  scriptId: string;
  versionId: string;
}

/**
 * Chép spec của phiên bản kịch bản sang video mới (`auto_check`) rồi start workflow dựng nháp với đúng phiên bản đó
 * (không gọi AI). Kiểm luật lại với dữ liệu sản phẩm hiện tại; không qua → `invalid` kèm danh sách luật.
 */
export async function createVideoFromScript(
  db: Db,
  temporal: TemporalClient,
  input: CreateVideoFromScriptInput,
): Promise<{ ok: true; video: Video; workflowId: string } | ScriptFailure> {
  const found = await loadScript(db, input.workspaceId, input.scriptId);
  if (!found) return fail('not_found', 'không tìm thấy kịch bản');
  const { script: s, version } = found;
  if (s.status !== 'ready' || !version) return fail('wrong_status', `kịch bản đang ở trạng thái ${s.status}, chưa tạo video được`);
  if (version.id !== input.versionId) return fail('stale_version', 'kịch bản đã có phiên bản mới hơn, tải lại để xem');

  const rules = await checkScriptRules(db, { workspaceId: input.workspaceId, productId: s.productId, spec: version.spec });
  if (!rules.every((r) => r.passed)) return fail('invalid', 'kịch bản chưa qua kiểm luật', rules);

  const created = await db.transaction(async (tx) => {
    const videoId = newId('video');
    const versionId = newId('videoVersion');
    const [v] = await tx
      .insert(video)
      .values({
        id: videoId,
        workspaceId: input.workspaceId,
        productId: s.productId,
        status: 'auto_check',
        createdBy: input.userId,
        templateId: s.templateId,
        templateVersion: s.templateVersion,
        scriptId: s.id,
        scriptVersionId: version.id,
      })
      .returning();
    if (!v) throw new Error('không tạo được video');
    await tx.insert(videoVersion).values({
      id: versionId,
      videoId,
      versionNo: 1,
      spec: version.spec,
      specHash: version.specHash,
      source: 'from_script',
      authorUserId: input.userId,
      changeSummary: `từ kịch bản ${s.id} (bản ${version.versionNo})`,
    });
    const [updated] = await tx
      .update(video)
      .set({ currentVersionId: versionId, updatedAt: sql`now()` })
      .where(eq(video.id, videoId))
      .returning();
    await tx.update(script).set({ updatedAt: sql`now()` }).where(eq(script.id, s.id));
    await writeAudit(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      action: 'video.create_from_script',
      targetType: 'video',
      targetId: videoId,
      data: { scriptId: s.id, scriptVersionId: version.id },
    });
    return { video: updated ?? v, versionId };
  });

  try {
    const { workflowId } = await startDraftWorkflow(temporal, {
      workspaceId: input.workspaceId,
      videoId: created.video.id,
      versionId: created.versionId,
    });
    return { ok: true, video: created.video, workflowId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markVideoFailed(db, created.video.id, 'drafting', `không start được workflow: ${message}`);
    throw new Error(`không start được workflow dựng video ${created.video.id}`, { cause: err });
  }
}
