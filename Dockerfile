# syntax=docker/dockerfile:1.7
# Image dùng chung cho api / worker / cli (khác nhau ở command). Chạy TS trực tiếp bằng tsx, không bước build.

FROM node:26-slim AS deps
RUN npm install -g pnpm@12.5.1
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/cli/package.json apps/cli/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter "@affilio/api..." --filter "@affilio/worker..." --filter "@affilio/cli..."

FROM node:26-slim AS runtime
# ffmpeg cho render (M1), font Noto để phụ đề tiếng Việt hiển thị đúng, tini để chuyển tín hiệu SIGTERM.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    STORAGE_DIR=/data/storage
WORKDIR /app
COPY --from=deps /app ./
COPY packages/core packages/core
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY apps/cli apps/cli
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
ENTRYPOINT ["tini", "--"]
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]
