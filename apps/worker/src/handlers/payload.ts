import { z } from 'zod';

export const videoPayloadSchema = z.object({ videoId: z.string().min(1), versionId: z.string().min(1).optional() });

/** Job AI sửa đúng một cảnh trong phiên bản đang chờ duyệt. */
export const revisePayloadSchema = z.object({
  videoId: z.string().min(1),
  versionId: z.string().min(1),
  sceneId: z.string().min(1),
  instruction: z.string().max(1000).nullish(),
});
