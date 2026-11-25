# Script Library Implementation Plan (đã thực hiện)

**Goal:** Tách kịch bản thành mục riêng; tạo video từ kịch bản có sẵn hoặc giao AI viết mới.

**Spec:** `docs/superpowers/specs/2026-11-25-script-library-design.md`

**Tech Stack:** drizzle + zod (core), Temporal (worker), Fastify (api), Nuxt 4 + Nuxt UI (web).

## Tasks

- [x] **Core** — bảng `script`, `script_version`, cột `video.script_id`/`script_version_id` (migration `0002_wild_lifeguard.sql`); nghiệp vụ ở `packages/core/src/script/index.ts`; test `script.test.ts`.
- [x] **Worker** — `scriptWriteWorkflow` + activity viết kịch bản trên queue `affilio-llm`; bỏ luồng `script_review` của video.
- [x] **API** — `/api/scripts`: `GET /`, `POST /ai`, `POST /`, `GET /:id`, `PUT /:id`, `POST /:id/regenerate`, `POST /:id/archive`, `POST /:id/videos`.
- [x] **Web** — `pages/scripts/index.vue`, `components/script/{AiScriptForm,AiScriptDialog,ScriptEditorDialog}.vue`, `CreateVideoDialog` 2 tab, dọn `pages/videos/index.vue` + `pages/review.vue`, xoá `ScriptReviewDialog.vue`.
- [x] **Kiểm chứng tĩnh** — `pnpm typecheck`, `pnpm lint`, `pnpm test` (51/51), `apps/web pnpm build`.
- [ ] **Kiểm chứng end-to-end** — chạy API + worker + Temporal + web; kịch bản thử ở `.claude/skills/async-script-drafting/SKILL.md`.

## Review Focus

- Hai người cùng sửa một kịch bản: lưu sau phải nhận 409, popup không ghi đè.
- Sản phẩm thiếu affiliate link / ảnh: lưu kịch bản được, tạo video bị chặn kèm lý do.
- Tạo video hàng loạt có kịch bản lỗi: các kịch bản còn lại vẫn tạo được, báo số lỗi.
- Đổi template khi tự viết: lời thoại đã gõ giữ theo thứ tự cảnh.
- Kịch bản AI viết lỗi: hiện `failedReason`, "AI viết lại" hoạt động từ `failed`.
