import { hostname } from 'node:os';
import { createDb, createLogger, createProviders, createStorage, loadConfig, markVideoFailed, recoverExpiredJobs } from '@affilio/core';
import { HANDLERS } from '#src/handlers/index.ts';
import { runQueue } from '#src/runner.ts';

const config = loadConfig();
const logger = createLogger({ name: 'worker', level: config.LOG_LEVEL, pretty: config.NODE_ENV === 'development' });

/** Thời gian chờ job đang chạy khi tắt; nhỏ hơn stop_grace_period (60s) của compose. */
const SHUTDOWN_GRACE_MS = 50_000;
const RECOVER_INTERVAL_MS = 30_000;

async function main(): Promise<void> {
  const workerId = config.WORKER_ID ?? `${hostname()}-${process.pid}`;
  const handle = createDb(config.DATABASE_URL, {
    max: config.WORKER_LLM_CONCURRENCY + config.WORKER_RENDER_CONCURRENCY + 2,
    appName: 'affilio-worker',
  });
  const providers = createProviders(config);
  const deps = { db: handle.db, config, providers, storage: createStorage(config) };
  logger.info({ workerId, llm: `${providers.llm.provider}/${providers.llm.model}` }, 'worker khởi động');

  const stop = new AbortController();
  const abort = new AbortController();

  const recover = setInterval(() => {
    recoverExpiredJobs(handle.db)
      .then(async ({ requeued, failed }) => {
        if (requeued > 0) logger.warn({ requeued }, 'đưa lại job hết hạn giữ chỗ');
        for (const job of failed) {
          logger.error({ jobId: job.id, jobType: job.type }, 'job hết hạn giữ chỗ và hết lượt thử');
          if (job.videoId) await markVideoFailed(handle.db, job.videoId, HANDLERS[job.type]?.step ?? job.type, job.lastError ?? 'worker chết giữa chừng');
        }
      })
      .catch((err: unknown) => logger.error({ err }, 'recover job lỗi'));
  }, RECOVER_INTERVAL_MS);

  const shutdown = (signal: string): void => {
    if (stop.signal.aborted) return;
    logger.info({ signal }, 'đang tắt worker, chờ job đang chạy');
    stop.abort();
    clearInterval(recover);
    setTimeout(() => {
      logger.warn('quá thời gian ân hạn, hủy job đang chạy');
      abort.abort();
    }, SHUTDOWN_GRACE_MS).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  const common = {
    workerId,
    pollMs: config.WORKER_POLL_MS,
    lockSeconds: config.JOB_LOCK_SECONDS,
    heartbeatSeconds: config.JOB_HEARTBEAT_SECONDS,
  };
  await Promise.all([
    runQueue(deps, logger, { ...common, queue: 'llm', concurrency: config.WORKER_LLM_CONCURRENCY }, stop.signal, abort.signal),
    runQueue(deps, logger, { ...common, queue: 'render', concurrency: config.WORKER_RENDER_CONCURRENCY }, stop.signal, abort.signal),
  ]);
  await handle.close();
  logger.info('worker đã tắt');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'worker dừng vì lỗi');
  process.exit(1);
});
