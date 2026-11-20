import { z } from 'zod';

export const videoPayloadSchema = z.object({ videoId: z.string().min(1), versionId: z.string().min(1).optional() });
