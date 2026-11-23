# affilio — Video Module

Bộ khung M0/M0.5 theo `plan-video-module-v4.html`. Pipeline: sản phẩm → LLM viết nháp spec → kiểm tra luật cứng → render preview → **hộp duyệt** → render final.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/core` | Dùng chung: config (zod), logger (pino), DB (Drizzle + Postgres 16, migration), client Temporal (start workflow idempotent theo ID), spec video + luật cứng, providers (Cloudflare Workers AI / stub), render (ffmpeg args), storage, máy trạng thái video |
| `apps/api` | Fastify 5, REST `/api/*` (products, videos, review, notes, health/ready) |
| `apps/worker` | Temporal worker: workflow (`src/workflows.ts`, queue `vm-video`) + activity (`src/activities.ts`, queue `vm-llm` / `vm-render`) |
| `apps/cli` | CLI `vm` thao tác nhanh không cần UI |
| `apps/web` | Nuxt 4 SPA + Tailwind CSS v4 — hộp duyệt video. Token màu (sáng/tối) và class dùng chung (`panel`, `btn`, `field`, `badge`) ở `app/assets/main.css` |
| `deploy/` | docker-compose (prod + dev, gồm Temporal), dynamic config Temporal, Caddyfile, script backup |
| `.github/` | CI (typecheck, lint, test, build, docker build), deploy lên VPS qua GHCR, Dependabot |

**Import:** trong một package dùng `#src/...` (Node subpath imports, khai báo ở `"imports"` của `package.json`), ví dụ `import { startDraftWorkflow } from '#src/temporal/index.ts'`. Giữa các package dùng `@vm/core`. Web dùng alias `~/` của Nuxt. ESLint chặn import tương đối `./`, `../`.

## Chạy dev

Cần Node 24, pnpm, Docker. ffmpeg cần cho render thật (hiện render đang là stub).

```bash
pnpm install
cp .env.example .env          # bỏ trống CF_* thì dùng LLM/ảnh stub
pnpm db:up                    # Postgres 16 (5432) + Temporal dev server (7233, UI http://localhost:8233)
pnpm db:migrate               # migration + seed workspace/user mặc định
pnpm dev:api                  # http://127.0.0.1:3100
pnpm dev:worker
pnpm dev:web                  # http://localhost:3001 (proxy /api → API_PROXY_TARGET)
```

> API dev dùng cổng **3100** để tránh đụng các dự án khác hay dùng 3000. Trong container vẫn là 3000.

CLI:

```bash
pnpm cli product:add --name "Bình giữ nhiệt" --url https://shope.ee/xxx
pnpm cli draft <productId>
pnpm cli list --status pending_review
pnpm cli review <videoId> approve
pnpm cli workflows --status Failed
```

## Kiểm tra

```bash
pnpm typecheck     # tsc cho core/api/worker/cli, nuxt typecheck cho web
pnpm lint          # eslint (file .ts; .vue do vue-tsc kiểm kiểu)
pnpm test          # vitest
pnpm build         # build web
```

Test workflow (`apps/worker/src/workflows.test.ts`) dùng `TestWorkflowEnvironment` time-skipping của Temporal với activity giả — lần chạy đầu tải test server về nên cần mạng, không cần Postgres hay Temporal đang chạy.

Đổi schema: sửa `packages/core/src/db/schema.ts` → `pnpm db:generate` → commit file migration mới. **Không sửa migration đã commit.** CI fail nếu schema và migration lệch nhau.

## Deploy

- Push lên `main` → CI xanh → workflow `deploy` build 2 image (`ghcr.io/<owner>/<repo>-app`, `-web`), tag theo commit sha, rồi SSH vào VPS: backup DB → pull → `docker compose up -d`.
- GitHub secrets cần có: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Environment `production` (nên bật required reviewers).
- Trên VPS, thư mục `/opt/vm` cần có `.env` (lấy từ `.env.example`, đổi `POSTGRES_PASSWORD`, `DOMAIN`, `BASIC_AUTH_HASH`, `IMAGE_APP`, `IMAGE_WEB`, `CF_*`, `MIGRATE_ON_START=true`).
- Caddy tự cấp HTTPS cho `DOMAIN`, bảo vệ toàn site bằng basic auth.
- Temporal chạy trong compose, dùng chung container Postgres nhưng 2 DB riêng `temporal` / `temporal_visibility` (service `temporal-schema` tự tạo + cập nhật schema mỗi lần `up`). Temporal UI chỉ mở ở `127.0.0.1:8080` của VPS — xem qua `ssh -L 8080:127.0.0.1:8080 <vps>`.
- Backup: `deploy/scripts/backup.sh` (pg_dump nén, giữ 14 bản), chạy trước mỗi lần deploy; nên thêm cron hằng ngày trên VPS.
