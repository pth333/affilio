import { canFinalRender, eq, transitionVideo, video } from '@affilio/core';
import type { JobHandler } from '#src/types.ts';
import { videoPayloadSchema } from '#src/handlers/payload.ts';

/**
 * Bộ khung: mới chuyển trạng thái. Render thật bằng FFmpeg (ảnh + zoompan + TTS + mascot,
 * cache theo sceneHash) làm ở M1 với các helper trong @affilio/core/render.
 */
export const renderPreviewHandler: JobHandler = {
  queue: 'render',
  step: 'previewing',
  async run({ job, deps, log }) {
    const { videoId, versionId } = videoPayloadSchema.parse(job.payload);
    const [v] = await deps.db.select().from(video).where(eq(video.id, videoId));
    if (!v || v.status !== 'previewing' || v.currentVersionId !== versionId) {
      log.warn({ status: v?.status, versionId }, 'preview không còn cần (video đã đổi), bỏ job');
      return { kind: 'done' };
    }
    // TODO(M1): render preview 540p vào storage, ghi bảng render + asset.
    await transitionVideo(deps.db, { videoId, from: ['previewing'], to: 'pending_review' });
    log.info({ versionId }, 'preview xong (stub), chờ duyệt');
    return { kind: 'done' };
  },
};

export const renderFinalHandler: JobHandler = {
  queue: 'render',
  step: 'rendering',
  async run({ job, deps, log }) {
    const { videoId, versionId } = videoPayloadSchema.parse(job.payload);
    const [v] = await deps.db.select().from(video).where(eq(video.id, videoId));
    if (!v) return { kind: 'done' };
    // Cổng duyệt: chỉ render đúng bản đã duyệt và đang là bản hiện tại.
    if (v.status === 'approved' && !canFinalRender(v)) {
      log.warn({ versionId, current: v.currentVersionId, approved: v.approvedVersionId }, 'bản hiện tại chưa được duyệt, không render');
      return { kind: 'done' };
    }
    if (v.status !== 'approved' && v.status !== 'rendering') {
      log.warn({ status: v.status }, 'video không ở trạng thái render, bỏ job');
      return { kind: 'done' };
    }
    if (v.status === 'approved') await transitionVideo(deps.db, { videoId, from: ['approved'], to: 'rendering' });
    // TODO(M1): render bản cuối 1080p, ghi asset kind=render.
    await transitionVideo(deps.db, { videoId, from: ['rendering'], to: 'ready' });
    log.info({ versionId }, 'render cuối xong (stub)');
    return { kind: 'done' };
  },
};
