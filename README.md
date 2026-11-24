# affilio — Video Module

Bộ khung M0/M0.5 theo `plan-video-module-v4.html`. Pipeline: sản phẩm → LLM viết nháp spec → kiểm tra luật cứng → render preview → **hộp duyệt** → render final.

## Cấu trúc

| Thư mục | Vai trò |
|---|---|
| `packages/core` | Dùng chung: config (zod), logger (pino), DB (Drizzle + Postgres 16, migration), client Temporal (start workflow idempotent theo ID), spec video + luật cứng, providers (Cloudflare Workers AI / stub), render (ffmpeg args), storage, máy trạng thái video |
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

### Luồng tạo video (AI gợi ý kịch bản → người duyệt → mới tạo video)

Trước đây bấm "Tạo video" là AI viết kịch bản ngay bên trong workflow, người dùng không xem/sửa được trước khi dựng preview. Luồng hiện tại tách bước gợi ý ra ngoài:

1. `GET /api/templates` — danh sách định dạng (bảng `template`: thứ tự cảnh, giọng điệu, giọng đọc).
2. `POST /api/videos/script` `{ productId, templateId }` — server ghép prompt từ template + sản phẩm, gọi LLM, trả `{ spec, rules, template }`. **Chưa tạo video**, chỉ ghi log/hạn mức AI.
3. Người dùng sửa lời thoại từng cảnh ngay trên popup (hoặc bỏ qua nếu đã ưng).
4. `POST /api/videos` `{ productId, templateId, spec }` — tạo video, lưu `spec` thành `video_version` đầu tiên (`template_id/template_version` ghi vào video) rồi start workflow.
5. Workflow `videoDraftWorkflow` thấy `spec` trong input thì **bỏ bước gọi AI**: chỉ kiểm luật cứng → render preview → `pending_review` để duyệt như cũ.

Bỏ `spec` thì API vẫn chạy luồng cũ (AI viết trong workflow) — CLI `pnpm cli draft <productId>` dùng đường này.

## Chạy dev

Cần Node 24, pnpm, Docker. ffmpeg cần cho render thật (hiện render đang là stub).

```bash
pnpm install
cp .env.example .env          # bỏ trống CF_* thì dùng LLM/ảnh stub
pnpm db:up                    # Postgres 16 (5432) + Temporal dev server (7233, UI http://localhost:8233)
pnpm db:migrate               # migration + seed workspace/user mặc định
pnpm dev                      # API + web + worker, Ctrl+C dừng cả 3
```

`pnpm dev` (hoặc `make dev`) làm 3 việc, Ctrl+C dừng 3 service của app:

1. bật **toàn bộ hạ tầng** bằng Docker (`deploy/docker-compose.dev.yml`): Postgres 16 (:5432), Temporal server (:7233) và Temporal UI (:8233);
2. chờ Postgres healthy, Temporal mở cổng rồi chạy migration (idempotent — bảng đã có thì bỏ qua);
3. chạy đồng thời API, web và worker với log gộp, tiền tố `[api] [web] [worker]`.

Hạ tầng Docker **không** bị tắt khi thoát (giữ dữ liệu, giữ workflow Temporal) — tắt bằng `make db-down`.

| Cờ của `scripts/dev-all.mjs` | Tác dụng |
|---|---|
| `node scripts/dev-all.mjs --no-infra` | không đụng Docker (khi hạ tầng đã chạy sẵn, ví dụ DB ở máy khác) |
| `node scripts/dev-all.mjs --no-migrate` | bật hạ tầng nhưng bỏ bước migration |
| `node scripts/dev-all.mjs --infra-only` (hoặc `make infra`) | chỉ bật hạ tầng + migrate rồi thoát |

| Service | Địa chỉ |
|---|---|
| API | http://127.0.0.1:3100 |
| Web | http://localhost:3001 (proxy `/api` → API) |
| Worker | hàng đợi `llm` / `render` |
| Temporal UI | http://localhost:8233 (server gRPC: `localhost:7233`) |

Muốn chạy riêng từng service: `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:worker` (hoặc `make api`, `make web`, `make worker`). Các lệnh khác xem ở `make help`.

> API dev dùng cổng **3100** để tránh đụng các dự án khác hay dùng 3000. Trong container vẫn là 3000.

### Temporal

Dự án **chưa** dùng Temporal — pipeline đang chạy bằng hàng đợi job tự viết trên Postgres (`jobs` + `SELECT … FOR UPDATE SKIP LOCKED`, heartbeat/retry; xem `packages/core/src/queue`). Hai service `temporal` + `temporal-ui` trong compose dev được bật cùng `make dev` để dựng sẵn và thử nghiệm:

- Server dùng chung Postgres dev; `auto-setup` tự tạo database `temporal`, `temporal_visibility` và namespace `default` (lần đầu mất ~30–60s).
- `make dev` chờ Temporal mở cổng trước khi chạy app; nếu Temporal chậm, app vẫn khởi động và chỉ in cảnh báo.
- Worker/client chạy ở máy host nối tới `localhost:7233`; UI ở http://localhost:8233.
- Image `temporalio/auto-setup` **chỉ dùng cho dev**; khi đưa lên production thì dùng `temporalio/server` + bước setup schema riêng (hoặc Temporal Cloud).

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
- Temporal chạy trong compose, dùng chung container Postgres nhưng 2 DB riêng `temporal` / `temporal_visibility` (service `temporal-schema` tự tạo + cập nhật schema mỗi lần `up`). Temporal UI chỉ mở ở `127.0.0.1:8080` của VPS — xem qua `ssh -L 8080:127.0.0.1:8080 <vps>`.
- Backup: `deploy/scripts/backup.sh` (pg_dump nén, giữ 14 bản), chạy trước mỗi lần deploy; nên thêm cron hằng ngày trên VPS.
