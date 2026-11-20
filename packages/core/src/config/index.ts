import { z } from 'zod';

/** Chuỗi rỗng trong .env coi như không đặt. */
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const boolString = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3100),
  MIGRATE_ON_START: boolString,

  WORKER_ID: optionalString,
  WORKER_LLM_CONCURRENCY: z.coerce.number().int().min(1).default(2),
  WORKER_RENDER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  WORKER_POLL_MS: z.coerce.number().int().min(100).default(1000),
  JOB_LOCK_SECONDS: z.coerce.number().int().min(10).default(120),
  JOB_HEARTBEAT_SECONDS: z.coerce.number().int().min(5).default(30),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),

  SEED_WORKSPACE_NAME: z.string().default('My Channel'),
  SEED_USER_EMAIL: z.string().email().default('owner@example.com'),

  CF_ACCOUNT_ID: optionalString,
  CF_API_TOKEN: optionalString,
  CF_MODEL: z.string().default('@cf/meta/llama-3.1-8b-instruct'),
  CF_IMAGE_MODEL: z.string().default('@cf/black-forest-labs/flux-1-schnell'),
  CF_DAILY_NEURONS: z.coerce.number().int().min(0).default(10_000),
});

export type AppConfig = z.infer<typeof envSchema> & {
  /** Có đủ khóa Cloudflare thì gọi thật, không thì dùng Stub. */
  cloudflareEnabled: boolean;
};

let cached: AppConfig | undefined;

/** Đọc và validate biến môi trường một lần; sai thì dừng ngay khi khởi động. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${issues}`);
  }
  const config: AppConfig = {
    ...parsed.data,
    cloudflareEnabled: Boolean(parsed.data.CF_ACCOUNT_ID && parsed.data.CF_API_TOKEN),
  };
  if (env === process.env) cached = config;
  return config;
}
