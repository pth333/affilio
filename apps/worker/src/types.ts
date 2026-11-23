import type { AppConfig, Db, Job, JobQueue, Logger, ProviderSet, Storage } from '@affilio/core';

export interface WorkerDeps {
  db: Db;
  config: AppConfig;
  providers: ProviderSet;
  storage: Storage;
  logger: Logger;
}

/** Kết quả activity viết nháp — workflow dựa vào đây để đi tiếp, chờ hạn mức hoặc dừng. */
export type DraftResult =
  | { kind: 'skipped'; reason: string }
  /** Hết hạn mức AI: workflow ngủ tới retryAt rồi thử lại, không tính lần thử. */
  | { kind: 'deferred'; retryAt: string }
  | { kind: 'drafted'; versionId: string; passed: boolean };

export type RenderResult = { kind: 'done' } | { kind: 'skipped'; reason: string };

export interface RenderPreviewInput {
  workspaceId: string;
  videoId: string;
  versionId: string;
}

export interface MarkFailedInput {
  videoId: string;
  step: string;
  reason: string;
}
