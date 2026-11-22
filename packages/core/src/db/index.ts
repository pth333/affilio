import { fileURLToPath } from 'node:url';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '#src/db/schema.ts';

export * from '#src/db/schema.ts';
// Re-export operator để app dùng cùng bản drizzle với core.
export { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
export { newId, ID_PREFIX, type IdKind } from '#src/db/id.ts';
export { ensureDefaultWorkspace, type DefaultContext } from '#src/db/seed.ts';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Db hoặc transaction — hàm nhận cái này dùng được trong cả hai ngữ cảnh. */
export type Executor = Db | Tx;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Số kết nối tối đa của pool. */
  max?: number;
  appName?: string;
}

export function createDb(url: string, { max = 10, appName = 'affilio' }: CreateDbOptions = {}): DbHandle {
  const client = postgres(url, {
    max,
    connection: { application_name: appName },
    // Ẩn NOTICE (vd. "relation already exists, skipping") khỏi stdout.
    onnotice: () => undefined,
  });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return {
    db,
    sql: client,
    close: () => client.end({ timeout: 5 }),
  };
}

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** Kiểm tra DB còn trả lời (dùng cho /api/ready). */
export async function pingDb(handle: DbHandle): Promise<void> {
  await handle.sql`select 1`;
}
