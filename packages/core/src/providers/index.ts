import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '#src/db/index.ts';
import { newId } from '#src/db/id.ts';
import { aiCallLog, quotaUsage, type AiPurpose } from '#src/db/schema.ts';

/**
 * Provider AI dùng chung một interface để đổi nhà cung cấp mà không sửa nghiệp vụ (mục 6 plan v4).
 * Mọi lời gọi đi qua callProvider(): giữ chỗ hạn mức → gọi → ghi ai_call_log.
 */

export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProviderResult<T> {
  value: T;
  /** Đơn vị tiêu tốn thực tế (neurons/ký tự). */
  units: number;
}

export interface LlmProvider {
  readonly provider: string;
  readonly model: string;
  /** Ước lượng đơn vị trước khi gọi, để giữ chỗ hạn mức. */
  estimateUnits(req: LlmRequest): number;
  complete(req: LlmRequest, signal?: AbortSignal): Promise<ProviderResult<string>>;
}

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  steps: number;
}

export interface ImageGenProvider {
  readonly provider: string;
  readonly model: string;
  estimateUnits(req: ImageRequest): number;
  generate(req: ImageRequest, signal?: AbortSignal): Promise<ProviderResult<Buffer>>;
}

export interface TtsProvider {
  readonly provider: string;
  synthesize(text: string, voice: { name: string; rate: number }, signal?: AbortSignal): Promise<ProviderResult<Buffer>>;
}

export interface ClipGenProvider {
  readonly provider: string;
  readonly model: string;
  generate(prompt: string, durationSec: number, signal?: AbortSignal): Promise<ProviderResult<Buffer>>;
}

// ───────────────────────── Stub (dev/test, không cần khóa) ─────────────────────────

const STUB_ROLES = new Set(['hook', 'intro', 'problem', 'benefit', 'demo', 'proof', 'compare', 'cta']);
/** Cảnh cần prompt ảnh AI; demo/proof bắt buộc dùng ảnh sản phẩm thật nên prompt = null. */
const STUB_AI_IMAGE_ROLES = new Set(['hook', 'intro', 'problem', 'benefit', 'compare']);

/** Đọc thứ tự cảnh mà template yêu cầu từ system prompt (dạng "1. hook — ..."). */
function stubRoles(system: string): string[] {
  const roles = Array.from(system.matchAll(/^\s*\d+\.\s*([a-z_]+)/gm))
    .map((match) => match[1] ?? '')
    .filter((role) => STUB_ROLES.has(role));
  return roles.length > 0 ? roles : ['hook', 'benefit', 'demo', 'cta'];
}

function stubNarration(role: string, productName: string): string {
  switch (role) {
    case 'hook':
      return `Bạn đã thử ${productName} chưa?`;
    case 'intro':
      return `Hôm nay mình giới thiệu ${productName}.`;
    case 'problem':
      return 'Cách cũ khiến việc này mất thời gian hơn cần thiết.';
    case 'benefit':
      return `${productName} giúp việc hằng ngày gọn gàng hơn hẳn.`;
    case 'demo':
      return 'Dùng rất đơn giản, chỉ vài bước là xong.';
    case 'proof':
      return 'Mình dùng thử hai tuần rồi, vẫn ổn định như ngày đầu.';
    case 'compare':
      return 'So với lựa chọn cùng giá, cái này chắc chắn hơn.';
    default:
      return 'Link mua mình để ở phần mô tả nhé.';
  }
}

/** Trả kịch bản JSON theo đúng định dạng template để chạy trọn luồng mà không tốn hạn mức. */
export class StubLlm implements LlmProvider {
  readonly provider = 'stub';
  readonly model = 'stub-llm';

  estimateUnits(): number {
    return 0;
  }

  async complete(req: LlmRequest): Promise<ProviderResult<string>> {
    const productName = /Sản phẩm:\s*(.+)/.exec(req.prompt)?.[1]?.trim() ?? 'sản phẩm';
    const script = {
      scenes: stubRoles(req.system).map((role) => ({
        role,
        narration: stubNarration(role, productName),
        prompt: STUB_AI_IMAGE_ROLES.has(role) ? `product photo for ${role} scene, vertical 9:16, soft light` : null,
      })),
    };
    return { value: JSON.stringify(script), units: 0 };
  }
}

/** PNG 1×1 trong suốt, đủ để luồng render chạy thử. */
const STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export class StubImageGen implements ImageGenProvider {
  readonly provider = 'stub';
  readonly model = 'stub-image';

  estimateUnits(): number {
    return 0;
  }

  async generate(): Promise<ProviderResult<Buffer>> {
    return { value: STUB_PNG, units: 0 };
  }
}

// ───────────────────────── Cloudflare Workers AI ─────────────────────────

const cfEnvelope = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ message: z.string() }).loose()).default([]),
  result: z.unknown(),
});
const cfTextResult = z.object({ response: z.string() }).loose();
const cfImageResult = z.object({ image: z.string() }).loose();

export interface CloudflareOptions {
  accountId: string;
  apiToken: string;
  model: string;
  timeoutMs?: number;
}

async function cfRun(opts: CloudflareOptions, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/ai/run/${opts.model}`;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 60_000);
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const json: unknown = await res.json().catch((err: unknown) => {
    throw new Error(`Cloudflare trả về không phải JSON (HTTP ${res.status})`, { cause: err });
  });
  const envelope = cfEnvelope.safeParse(json);
  if (!envelope.success) throw new Error(`Cloudflare trả về sai định dạng (HTTP ${res.status})`);
  if (!res.ok || !envelope.data.success) {
    const msg = envelope.data.errors.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare lỗi: ${msg}`);
  }
  return envelope.data.result;
}

/** Ước lượng thô: ~4 ký tự/token, neurons tỉ lệ với token. Chỉ để giữ chỗ, số thật ghi sau. */
const NEURONS_PER_1K_TOKENS = 30;

export class CloudflareLlm implements LlmProvider {
  readonly provider = 'cloudflare';
  readonly model: string;

  constructor(private readonly opts: CloudflareOptions) {
    this.model = opts.model;
  }

  estimateUnits(req: LlmRequest): number {
    const tokens = (req.system.length + req.prompt.length) / 4 + (req.maxTokens ?? 800);
    return Math.ceil((tokens / 1000) * NEURONS_PER_1K_TOKENS);
  }

  async complete(req: LlmRequest, signal?: AbortSignal): Promise<ProviderResult<string>> {
    const result = await cfRun(
      this.opts,
      {
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.prompt },
        ],
        max_tokens: req.maxTokens ?? 800,
        temperature: req.temperature ?? 0.7,
      },
      signal,
    );
    const parsed = cfTextResult.safeParse(result);
    if (!parsed.success) throw new Error('Cloudflare LLM không trả về trường response');
    return { value: parsed.data.response, units: this.estimateUnits(req) };
  }
}

export class CloudflareImageGen implements ImageGenProvider {
  readonly provider = 'cloudflare';
  readonly model: string;

  constructor(private readonly opts: CloudflareOptions) {
    this.model = opts.model;
  }

  estimateUnits(req: ImageRequest): number {
    // flux-1-schnell: ~4.8 neurons/512x512 tile + ~9.6/step (ước lượng, xem bảng giá CF).
    const tiles = Math.ceil((req.width * req.height) / (512 * 512));
    return Math.ceil(tiles * 4.8 + req.steps * 9.6);
  }

  async generate(req: ImageRequest, signal?: AbortSignal): Promise<ProviderResult<Buffer>> {
    const result = await cfRun(this.opts, { prompt: req.prompt, steps: req.steps }, signal);
    const parsed = cfImageResult.safeParse(result);
    if (!parsed.success) throw new Error('Cloudflare image không trả về trường image');
    return { value: Buffer.from(parsed.data.image, 'base64'), units: this.estimateUnits(req) };
  }
}

export interface ProviderSet {
  llm: LlmProvider;
  image: ImageGenProvider;
  /** Hạn mức ngày theo provider; không có = không giới hạn (stub). */
  dailyLimits: Record<string, number>;
}

export function createProviders(config: {
  cloudflareEnabled: boolean;
  CF_ACCOUNT_ID?: string | undefined;
  CF_API_TOKEN?: string | undefined;
  CF_MODEL: string;
  CF_IMAGE_MODEL: string;
  CF_DAILY_NEURONS: number;
}): ProviderSet {
  if (config.cloudflareEnabled && config.CF_ACCOUNT_ID && config.CF_API_TOKEN) {
    const base = { accountId: config.CF_ACCOUNT_ID, apiToken: config.CF_API_TOKEN };
    return {
      llm: new CloudflareLlm({ ...base, model: config.CF_MODEL }),
      image: new CloudflareImageGen({ ...base, model: config.CF_IMAGE_MODEL }),
      dailyLimits: { cloudflare: config.CF_DAILY_NEURONS },
    };
  }
  return { llm: new StubLlm(), image: new StubImageGen(), dailyLimits: {} };
}

// ───────────────────────── callProvider: hạn mức + log ─────────────────────────

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Hạn mức ngày reset lúc 00:00 UTC — thời điểm thử lại khi hết hạn mức. */
export function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export interface CallContext {
  workspaceId: string;
  purpose: AiPurpose;
  provider: string;
  model: string;
  estUnits: number;
  /** undefined = không giới hạn. */
  dailyLimit: number | undefined;
  jobId?: string;
  videoId?: string;
  /** Lưu prompt vào log để debug (cắt ngắn). */
  prompt?: string;
}

export type CallOutcome<T> = { ok: true; value: T; units: number } | { ok: false; reason: 'quota_exceeded'; retryAt: Date };

const LOG_TEXT_LIMIT = 4000;

/** Giữ chỗ hạn mức nguyên tử: chỉ cộng khi reserved + used + est ≤ limit. */
async function reserveQuota(db: Db, ctx: CallContext, day: string, limit: number): Promise<boolean> {
  await db
    .insert(quotaUsage)
    .values({ workspaceId: ctx.workspaceId, provider: ctx.provider, day })
    .onConflictDoNothing();
  const rows = await db
    .update(quotaUsage)
    .set({ reserved: sql`${quotaUsage.reserved} + ${ctx.estUnits}` })
    .where(
      and(
        eq(quotaUsage.workspaceId, ctx.workspaceId),
        eq(quotaUsage.provider, ctx.provider),
        eq(quotaUsage.day, day),
        sql`${quotaUsage.reserved} + ${quotaUsage.used} + ${ctx.estUnits} <= ${limit}`,
      ),
    )
    .returning({ day: quotaUsage.day });
  return rows.length > 0;
}

async function settleQuota(db: Db, ctx: CallContext, day: string, usedUnits: number): Promise<void> {
  await db
    .update(quotaUsage)
    .set({
      reserved: sql`greatest(${quotaUsage.reserved} - ${ctx.estUnits}, 0)`,
      used: sql`${quotaUsage.used} + ${usedUnits}`,
    })
    .where(and(eq(quotaUsage.workspaceId, ctx.workspaceId), eq(quotaUsage.provider, ctx.provider), eq(quotaUsage.day, day)));
}

export async function callProvider<T>(
  db: Db,
  ctx: CallContext,
  fn: () => Promise<ProviderResult<T>>,
  describeOutput: (value: T) => string = () => '',
): Promise<CallOutcome<T>> {
  const day = utcDay();
  const limited = ctx.dailyLimit !== undefined && ctx.estUnits > 0;
  if (limited && ctx.dailyLimit !== undefined && !(await reserveQuota(db, ctx, day, ctx.dailyLimit))) {
    return { ok: false, reason: 'quota_exceeded', retryAt: nextUtcMidnight() };
  }

  const started = performance.now();
  const base = {
    workspaceId: ctx.workspaceId,
    jobId: ctx.jobId ?? null,
    videoId: ctx.videoId ?? null,
    purpose: ctx.purpose,
    provider: ctx.provider,
    model: ctx.model,
    prompt: ctx.prompt?.slice(0, LOG_TEXT_LIMIT) ?? null,
  };
  try {
    const result = await fn();
    const latencyMs = Math.round(performance.now() - started);
    if (limited) await settleQuota(db, ctx, day, result.units);
    await db.insert(aiCallLog).values({
      ...base,
      id: newId('aiCall'),
      units: result.units,
      latencyMs,
      status: 'ok',
      output: describeOutput(result.value).slice(0, LOG_TEXT_LIMIT) || null,
    });
    return { ok: true, value: result.value, units: result.units };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const message = err instanceof Error ? err.message : String(err);
    // Lỗi thì trả lại phần giữ chỗ; vẫn ghi log để thấy tỉ lệ lỗi theo provider.
    if (limited) await settleQuota(db, ctx, day, 0);
    await db.insert(aiCallLog).values({ ...base, id: newId('aiCall'), units: 0, latencyMs, status: 'error', error: message.slice(0, LOG_TEXT_LIMIT) });
    throw err;
  }
}
