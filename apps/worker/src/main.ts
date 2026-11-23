import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import { createDb, createLogger, createProviders, createStorage, loadConfig, TASK_QUEUES } from '@affilio/core';
import { createActivities } from '#src/activities.ts';

const config = loadConfig();
const logger = createLogger({ name: 'worker', level: config.LOG_LEVEL, pretty: config.NODE_ENV === 'development' });

/** Thời gian chờ activity đang chạy khi tắt; nhỏ hơn stop_grace_period (60s) của compose. */
const SHUTDOWN_GRACE_MS = 50_000;

async function main(): Promise<void> {
  const identity = config.WORKER_ID ?? `${hostname()}-${process.pid}`;
  const handle = createDb(config.DATABASE_URL, {
    max: config.WORKER_LLM_CONCURRENCY + config.WORKER_RENDER_CONCURRENCY + 2,
    appName: 'affilio-worker',
  });
  const providers = createProviders(config);
  const activities = createActivities({ db: handle.db, config, providers, storage: createStorage(config), logger });
  const { draftVideo, reviseScene, renderPreview, renderFinal, markVideoFailed } = activities;

  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const common = { connection, namespace: config.TEMPORAL_NAMESPACE, identity, shutdownGraceTime: SHUTDOWN_GRACE_MS };
  // SIGTERM/SIGINT do Runtime của Temporal bắt sẵn: ngừng nhận việc, chờ activity đang chạy tối đa SHUTDOWN_GRACE_MS.
  const workers = await Promise.all([
    Worker.create({
      ...common,
      taskQueue: TASK_QUEUES.video,
      workflowsPath: fileURLToPath(new URL('./workflows.ts', import.meta.url)),
      activities: { markVideoFailed },
    }),
    Worker.create({
      ...common,
      taskQueue: TASK_QUEUES.llm,
      activities: { draftVideo, reviseScene },
      maxConcurrentActivityTaskExecutions: config.WORKER_LLM_CONCURRENCY,
    }),
    Worker.create({
      ...common,
      taskQueue: TASK_QUEUES.render,
      activities: { renderPreview, renderFinal },
      maxConcurrentActivityTaskExecutions: config.WORKER_RENDER_CONCURRENCY,
    }),
  ]);
  logger.info({ identity, temporal: config.TEMPORAL_ADDRESS, llm: `${providers.llm.provider}/${providers.llm.model}` }, 'worker khởi động');

  // Một worker chết thì tắt luôn các worker còn lại để container restart sạch.
  const results = await Promise.allSettled(
    workers.map((w) =>
      w.run().catch((err: unknown) => {
        for (const other of workers) if (other.getState() === 'RUNNING') other.shutdown();
        throw err;
      }),
    ),
  );
  await connection.close();
  await handle.close();
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  logger.info('worker đã tắt');
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'worker dừng vì lỗi');
  process.exit(1);
});
