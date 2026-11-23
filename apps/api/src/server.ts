import { createDb, createLogger, createStorage, ensureDefaultWorkspace, loadConfig, runMigrations } from '@affilio/core';
import { buildApp } from '#src/app.ts';

const config = loadConfig();
const logger = createLogger({ name: 'api', level: config.LOG_LEVEL, pretty: config.NODE_ENV === 'development' });

async function main(): Promise<void> {
  const handle = createDb(config.DATABASE_URL, { max: 10, appName: 'affilio-api' });
  if (config.MIGRATE_ON_START) {
    await runMigrations(handle.db);
    logger.info('đã chạy migration');
  }
  const session = await ensureDefaultWorkspace(handle.db, { workspaceName: config.SEED_WORKSPACE_NAME, userEmail: config.SEED_USER_EMAIL });
  const temporal = await createTemporalClient(config);
  const app = await buildApp({ db: handle.db, handle, config, storage: createStorage(config), session, temporal: temporal.client }, logger);

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'đang tắt api');
    const force = setTimeout(() => {
      logger.error('tắt quá 10s, thoát cưỡng bức');
      process.exit(1);
    }, 10_000);
    force.unref();
    try {
      await app.close();
      await Promise.all([handle.close(), temporal.close()]);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'lỗi khi tắt api');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'api không khởi động được');
  process.exit(1);
});
