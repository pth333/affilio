# affilio — Video Module

Bộ khung M0/M0.5 theo `plan-video-module-v4.html`. Pipeline: sản phẩm → LLM viết nháp spec → kiểm tra luật cứng → render preview → **hộp duyệt** → render final.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/core` | Dùng chung: config (zod), logger (pino), DB (Drizzle + Postgres 16, migration), hàng đợi Postgres (`SKIP LOCKED`, heartbeat, retry, defer), spec video + luật cứng, providers (Cloudflare Workers AI / stub), render (ffmpeg args), storage, máy trạng thái video |
| `apps/api` | Fastify 5, REST `/api/*` (products, videos, review, notes, health/ready) |
| `apps/worker` | Worker nhận job theo queue `llm` / `render` |
| `apps/cli` | CLI `affilio` thao tác nhanh không cần UI |
| `apps/web` | Nuxt 4 SPA + Tailwind CSS v4 + Nuxt UI (bảng dùng `UTable`) + Pinia (store dùng chung) — hộp duyệt video. Token màu (sáng/tối) và class dùng chung (`panel`, `btn`, `field`, `badge`) ở `app/assets/main.css` |
| `deploy/` | docker-compose (prod + dev), Caddyfile, script backup |
| `.github/` | CI (typecheck, lint, test, build, docker build), deploy lên VPS qua GHCR, Dependabot |

**Import:** trong một package dùng `#src/...` (Node subpath imports, khai báo ở `"imports"` của `package.json`), ví dụ `import { claimJobs } from '#src/queue/index.ts'`. Giữa các package dùng `@affilio/core`. Web dùng alias `~/` của Nuxt. ESLint chặn import tương đối `./`, `../`.

### Cấu trúc `apps/api`

Một request đi lần lượt: **route → controller → service → repository**.

| Tầng | Thư mục | Trách nhiệm |
|---|---|---|
| Route | `src/routes/` | Khai báo method + path, trỏ tới controller. Không có logic. |
| Controller | `src/controllers/` | Đọc request, validate bằng schema, gọi service, chọn status và body trả về. |
| Service | `src/services/` | Nghiệp vụ: phối hợp repository với các quy tắc trong `@affilio/core`, ném `AppError` (400/404/409). |
| Repository | `src/repositories/` | Chỉ truy vấn Drizzle (không biết HTTP). |

`src/schemas.ts` gom toàn bộ schema Zod cho dữ liệu đầu vào (params, query phân trang, body) và type suy ra từ chúng. `src/shared.ts` gom các hàm dùng lại được: `AppError` + các hàm dựng lỗi (`badRequest`, `notFound`, `conflict`), `validate()` và phân trang `toPage()`.

## Chạy dev

Cần Node 24, pnpm, Docker. ffmpeg cần cho render thật (hiện render đang là stub).

```bash
pnpm install
cp .env.example .env          # bỏ trống CF_* thì dùng LLM/ảnh stub
pnpm db:up                    # Postgres 16 ở cổng 5432
pnpm db:migrate               # migration + seed workspace/user mặc định
pnpm dev                      # API + web + worker, Ctrl+C dừng cả 3
```

`pnpm dev` (hoặc `make dev`) chạy đồng thời 3 service với log gộp, tiền tố `[api] [web] [worker]`:

| Service | Địa chỉ |
|---|---|
| API | http://127.0.0.1:3100 |
| Web | http://localhost:3001 (proxy `/api` → API) |
| Worker | hàng đợi `llm` / `render` |

Muốn chạy riêng từng service: `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:worker` (hoặc `make api`, `make web`, `make worker`). Các lệnh khác xem ở `make help`.

> API dev dùng cổng **3100** để tránh đụng các dự án khác hay dùng 3000. Trong container vẫn là 3000.

CLI:

```bash
pnpm cli product:add --name "Bình giữ nhiệt" --url https://shope.ee/xxx
pnpm cli draft <productId>
pnpm cli list --status pending_review
pnpm cli review <videoId> approve
pnpm cli jobs --status failed
```

## Kiểm tra

```bash
pnpm typecheck     # tsc cho core/api/worker/cli, nuxt typecheck cho web
pnpm lint          # eslint (file .ts; .vue do vue-tsc kiểm kiểu)
pnpm test          # vitest
pnpm build         # build web
```

Test tích hợp hàng đợi chỉ chạy khi `TEST_DATABASE_URL` trỏ tới DB có tên kết thúc bằng `_test` (test sẽ xoá bảng `jobs` của DB đó):

```bash
docker compose -f deploy/docker-compose.dev.yml exec postgres psql -U affilio -c "create database affilio_test"
TEST_DATABASE_URL=postgres://affilio:affilio@localhost:5432/affilio_test pnpm test
```

Đổi schema: sửa `packages/core/src/db/schema.ts` → `pnpm db:generate` → commit file migration mới. **Không sửa migration đã commit.** CI fail nếu schema và migration lệch nhau.

## Deploy

- Push lên `main` → CI xanh → workflow `deploy` build 2 image (`ghcr.io/<owner>/<repo>-app`, `-web`), tag theo commit sha, rồi SSH vào VPS: backup DB → pull → `docker compose up -d`.
- GitHub secrets cần có: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Environment `production` (nên bật required reviewers).
- Trên VPS, thư mục `/opt/affilio` cần có `.env` (lấy từ `.env.example`, đổi `POSTGRES_PASSWORD`, `DOMAIN`, `BASIC_AUTH_HASH`, `IMAGE_APP`, `IMAGE_WEB`, `CF_*`, `MIGRATE_ON_START=true`).
- Caddy tự cấp HTTPS cho `DOMAIN`, bảo vệ toàn site bằng basic auth.
- Backup: `deploy/scripts/backup.sh` (pg_dump nén, giữ 14 bản), chạy trước mỗi lần deploy; nên thêm cron hằng ngày trên VPS.
