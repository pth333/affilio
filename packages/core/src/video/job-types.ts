/** Tên job dùng chung giữa API/CLI (enqueue) và worker (handler). */
export const JOB_TYPES = {
  draft: 'video.draft',
  revise: 'video.revise',
  renderPreview: 'video.render_preview',
  renderFinal: 'video.render_final',
} as const;
