import { normalizeStorageKey } from '@affilio/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { mediaParamsSchema } from '#src/schemas.ts';
import { notFound, validate } from '#src/shared.ts';

/** Đuôi tệp → MIME; đủ cho các loại tệp app ghi ra Storage (ảnh, clip, nhạc, TTS, bản render). */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
};

/**
 * Tầng controller phục vụ tệp trong Storage (ảnh sản phẩm, clip, bản render…).
 * Không truy vấn DB: MIME suy ra từ đuôi tệp, quyền truy cập kiểm tra bằng tiền tố khóa.
 */
export const mediaController = {
  async get(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { '*': rawKey } = validate(mediaParamsSchema, req.params);
    const { storage, session } = req.server.deps;

    let key: string;
    try {
      key = normalizeStorageKey(decodeURIComponent(rawKey));
    } catch {
      throw notFound('Không tìm thấy tệp');
    }

    // Mọi tệp do API/worker ghi đều nằm dưới ws/<workspaceId>/ nên chỉ phục vụ đúng workspace hiện tại.
    if (!key.startsWith(`ws/${session.workspaceId}/`)) throw notFound('Không tìm thấy tệp');

    const data = await storage.get(key);
    if (!data) throw notFound('Không tìm thấy tệp');

    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    // Khóa chứa ULID/uuid nên nội dung của một khóa là bất biến → cache dài hạn ở client/CDN.
    return reply.header('cache-control', 'public, max-age=31536000, immutable').type(mime).send(data);
  },
};
