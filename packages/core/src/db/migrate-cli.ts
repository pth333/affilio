import { loadConfig } from '#src/config/index.ts';
import { createLogger } from '#src/logger.ts';
import { createDb, ensureDefaultWorkspace, runMigrations } from '#src/db/index.ts';

/** pnpm db:migrate — tạo bảng và seed workspace + user mặc định. */
const config = loadConfig();
const log = createLogger({ name: 'migrate', level: config.LOG_LEVEL, pretty: config.NODE_ENV === 'development' });
const handle = createDb(config.DATABASE_URL, { max: 1, appName: 'affilio-migrate' });

try {
  await runMigrations(handle.db);
  const ctx = await ensureDefaultWorkspace(handle.db, {
    workspaceName: config.SEED_WORKSPACE_NAME,
    userEmail: config.SEED_USER_EMAIL,
  });
  log.info(ctx, 'migration xong, đã có workspace mặc định');
} catch (err) {
  log.error({ err }, 'migration lỗi');
  process.exitCode = 1;
} finally {
  await handle.close();
}
