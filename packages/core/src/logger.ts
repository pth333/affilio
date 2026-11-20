import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Logger dùng chung. Production: mỗi dòng là JSON ra stdout để Docker thu.
 * Dev: in đẹp bằng pino-pretty.
 * Muốn gom log tập trung (Sentry, Loki, Better Stack) thì gắn transport/hook ở đây.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.password_hash',
  '*.passwordHash',
  '*.token',
  '*.apiToken',
  '*.secret',
  'CF_API_TOKEN',
];

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({ name, level = 'info', pretty = false }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    name,
    level,
    base: { service: name },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: { level: (label) => ({ level: label }) },
  };
  if (pretty) {
    return pino({
      ...options,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } },
    });
  }
  return pino(options);
}

export type { Logger };
