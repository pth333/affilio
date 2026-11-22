import { randomUUID } from 'node:crypto';
import sensible from '@fastify/sensible';
import type { AppConfig, Db, DbHandle, DefaultContext, Logger, Storage } from '@affilio/core';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { healthRoutes } from '#src/routes/health.ts';
import { productRoutes } from '#src/routes/products.ts';
import { videoRoutes } from '#src/routes/videos.ts';
import { AppError, formatZodIssues } from '#src/shared.ts';

/**
 * Dựng Fastify app: cấu hình chung, map lỗi và gắn route.
 *
 * Luồng một request — routes/ chỉ khai báo đường dẫn:
 *   routes → controllers (validate + response) → services (nghiệp vụ) → repositories (DB).
 */
export interface AppDeps {
  db: Db;
  handle: DbHandle;
  config: AppConfig;
  storage: Storage;
  /**
   * Workspace/user của phiên. Giai đoạn đầu lấy từ seed phía server (basic auth ở Caddy);
   * không bao giờ nhận workspace_id từ client.
   */
  session: DefaultContext;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export async function buildApp(deps: AppDeps, logger: Logger): Promise<FastifyInstance> {
  // Upcast pino Logger về kiểu logger chung của Fastify để route/plugin dùng kiểu mặc định.
  const baseLogger: FastifyBaseLogger = logger;
  const app = Fastify({
    loggerInstance: baseLogger,
    // Nhận x-request-id từ Caddy/client nếu hợp lệ để nối log xuyên dịch vụ.
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  app.decorate('deps', deps);
  await app.register(sensible);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    // Lỗi nghiệp vụ do service ném ra: dùng đúng status và thông báo đã định nghĩa.
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: err.error,
        message: err.message,
        ...(err.issues ? { issues: err.issues } : {}),
      });
    }
    // ZodError lọt ra ngoài validate() (vd. từ @affilio/core) vẫn trả 400 kèm lỗi từng trường.
    if (err instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Dữ liệu gửi lên không hợp lệ',
        issues: formatZodIssues(err),
      });
    }
    const status = err instanceof Error && 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, 'lỗi không xử lý được');
      // Không lộ chi tiết nội bộ ra client.
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Lỗi máy chủ, thử lại sau', requestId: req.id });
    }
    const message = err instanceof Error ? err.message : 'Yêu cầu không hợp lệ';
    return reply.status(status).send({ error: err instanceof Error ? err.name : 'Error', message });
  });

  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: 'Not Found', message: `Không có ${req.method} ${req.url}` }));

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(productRoutes, { prefix: '/api/products' });
  await app.register(videoRoutes, { prefix: '/api/videos' });
  return app;
}
