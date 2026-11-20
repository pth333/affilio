import { setTimeout as sleep } from 'node:timers/promises';
import {
  claimJobs,
  completeJob,
  deferJob,
  failJob,
  heartbeat,
  markVideoFailed,
  type Job,
  type JobQueue,
  type Logger,
} from '@vm/core';
import { HANDLERS } from '#src/handlers/index.ts';
import type { WorkerDeps } from '#src/types.ts';

export interface RunnerOptions {
  queue: JobQueue;
  concurrency: number;
  workerId: string;
  pollMs: number;
  lockSeconds: number;
  heartbeatSeconds: number;
}

/**
 * Mỗi hàng đợi chạy `concurrency` vòng lặp độc lập: claim 1 job → chạy → báo kết quả.
 * `stop` ngừng nhận job mới; `abort` hủy job đang chạy (khi quá thời gian ân hạn).
 */
export async function runQueue(deps: WorkerDeps, logger: Logger, opts: RunnerOptions, stop: AbortSignal, abort: AbortSignal): Promise<void> {
  const log = logger.child({ queue: opts.queue });
  log.info({ concurrency: opts.concurrency }, 'bắt đầu nhận job');
  await Promise.all(Array.from({ length: opts.concurrency }, (_, slot) => slotLoop(deps, log.child({ slot }), opts, stop, abort)));
  log.info('đã dừng nhận job');
}

async function slotLoop(deps: WorkerDeps, log: Logger, opts: RunnerOptions, stop: AbortSignal, abort: AbortSignal): Promise<void> {
  while (!stop.aborted) {
    let job: Job | undefined;
    try {
      [job] = await claimJobs(deps.db, { queue: opts.queue, workerId: opts.workerId, lockSeconds: opts.lockSeconds, limit: 1 });
    } catch (err) {
      log.error({ err }, 'claim job lỗi, thử lại sau');
    }
    if (!job) {
      await sleep(opts.pollMs, undefined, { signal: stop }).catch((err: unknown) => {
        if (!stop.aborted) throw err;
      });
      continue;
    }
    await runJob(deps, log, opts, job, abort);
  }
}

async function runJob(deps: WorkerDeps, baseLog: Logger, opts: RunnerOptions, job: Job, abort: AbortSignal): Promise<void> {
  const log = baseLog.child({ jobId: job.id, jobType: job.type, attempt: job.attempts, workspaceId: job.workspaceId, videoId: job.videoId });
  const lost = new AbortController();
  const signal = AbortSignal.any([abort, lost.signal]);
  const started = performance.now();

  const beat = setInterval(() => {
    heartbeat(deps.db, job.id, opts.workerId, opts.lockSeconds)
      .then((ok) => {
        if (!ok) {
          log.warn('mất quyền giữ job, hủy');
          lost.abort();
        }
      })
      .catch((err: unknown) => log.warn({ err }, 'heartbeat lỗi'));
  }, opts.heartbeatSeconds * 1000);

  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw new Error(`không có handler cho job type ${job.type}`);
    log.info('bắt đầu job');
    const result = await handler.run({ job, deps, log, signal });
    const ms = Math.round(performance.now() - started);
    if (result.kind === 'defer') {
      await deferJob(deps.db, job.id, opts.workerId, result.runAfter, result.reason);
      log.info({ ms, runAfter: result.runAfter, reason: result.reason }, 'dời job');
    } else {
      const ok = await completeJob(deps.db, job.id, opts.workerId);
      log.info({ ms, ok }, 'job xong');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome = await failJob(deps.db, job, opts.workerId, message).catch((e: unknown) => {
      log.error({ err: e }, 'không ghi được trạng thái lỗi của job');
      return 'lost' as const;
    });
    log.error({ err, outcome, ms: Math.round(performance.now() - started) }, 'job lỗi');
    if (outcome === 'failed' && job.videoId) {
      await markVideoFailed(deps.db, job.videoId, HANDLERS[job.type]?.step ?? job.type, message);
    }
  } finally {
    clearInterval(beat);
  }
}
