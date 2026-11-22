import type { AppConfig, Db, Job, JobQueue, Logger, ProviderSet, Storage } from '@affilio/core';

export interface WorkerDeps {
  db: Db;
  config: AppConfig;
  providers: ProviderSet;
  storage: Storage;
}

export interface JobContext {
  job: Job;
  deps: WorkerDeps;
  log: Logger;
  /** Bị hủy khi worker tắt quá thời gian ân hạn hoặc mất quyền giữ job. */
  signal: AbortSignal;
}

/** done = xong; defer = dời lại mà không tính lần thử (vd. hết hạn mức). */
export type JobResult = { kind: 'done' } | { kind: 'defer'; runAfter: Date; reason: string };

export interface JobHandler {
  queue: JobQueue;
  /** Bước ghi vào video.failed_step khi hết lượt thử. */
  step: string;
  run(ctx: JobContext): Promise<JobResult>;
}
