import { JOB_TYPES } from '@affilio/core';
import type { JobHandler } from '#src/types.ts';
import { draftHandler } from '#src/handlers/draft.ts';
import { renderFinalHandler, renderPreviewHandler } from '#src/handlers/render.ts';

export const HANDLERS: Readonly<Record<string, JobHandler>> = {
  [JOB_TYPES.draft]: draftHandler,
  [JOB_TYPES.renderPreview]: renderPreviewHandler,
  [JOB_TYPES.renderFinal]: renderFinalHandler,
};

