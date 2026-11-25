---
name: async-script-drafting
description: Bối cảnh và tiến độ tính năng "Thư viện kịch bản" (AI viết kịch bản ở worker Temporal / tự viết, tạo video từ kịch bản) trên nhánh feature/async-script-drafting — dùng khi tiếp tục làm, sửa lỗi, test hoặc review luồng kịch bản → video.
---

# Thư viện kịch bản (script library)

Thiết kế đã chốt: `docs/superpowers/specs/2026-11-25-script-library-design.md`. Plan tóm tắt: `docs/superpowers/plans/2026-11-25-script-library.md`.

## Ý tưởng
Kịch bản là thực thể riêng (bảng `script` + `script_version`), không còn là một giai đoạn của video.
- AI viết ở nền (Temporal, queue `affilio-llm`) hoặc người dùng tự viết.
- Một kịch bản `ready` tạo được nhiều video; video lưu `script_id` + `script_version_id`.
- Trạng thái video `script_review` **đã bỏ**; video tạo từ kịch bản đi thẳng `auto_check → previewing → pending_review`.

## Luồng
```
AI:      POST /api/scripts/ai {productIds[1..20], templateId} → mỗi sản phẩm 1 script `writing`
         → scriptWriteWorkflow (id `script.write:<scriptId>:<fromVersionId|initial>`) → version ai_draft → `ready` | `failed`
Tự viết: POST /api/scripts {productId, templateId, scenes:[{narration}]} → số cảnh phải = số cảnh template → `ready`
Sửa:     PUT /api/scripts/:id {versionId, scenes} → version user_edit (409 nếu versionId cũ hoặc không `ready`)
Viết lại: POST /:id/regenerate (từ ready|failed) → `writing`
Lưu trữ: POST /:id/archive (từ ready|failed) → `archived` (list mặc định ẩn archived)
Tạo video: POST /:id/videos {versionId} → kiểm luật lại (400 kèm issues) → video `auto_check` + videoDraftWorkflow
```
Luật thuộc dữ liệu sản phẩm (`affiliate_link`, `product_image_owner` = `PRODUCT_DATA_RULES` ở web) không chặn lưu kịch bản, chỉ chặn lúc tạo video.

## File chính
- **core**: `src/script/index.ts` (toàn bộ nghiệp vụ, `SCRIPT_NARRATION_MAX = 400`), `script.test.ts`; `db/schema.ts`; migration `drizzle/0002_wild_lifeguard.sql`; `temporal/shared.ts` + `index.ts` (`scriptWrite`).
- **worker**: `activities.ts` (viết kịch bản), `workflows.ts` (`scriptWriteWorkflow`), `main.ts`.
- **api**: `routes/scripts.ts`, `controllers/script.controller.ts`, `services/script.service.ts`, `repositories/script.repository.ts` (list có `currentSource`, `videoCount`), `schemas.ts`.
- **web**:
  - `api/script.ts` (`scriptApi`), `types.ts` (`ScriptListItem`, `ScriptDetail`, `SCRIPT_STATUS_LABEL`…).
  - `utils/helpers.ts`: `PRODUCT_DATA_RULES`, `SCRIPT_NARRATION_MAX`, `templateOutline`, `isNewScript` (nhãn "Mới" = AI viết, ready, bản ai_draft, chưa tạo video).
  - `pages/scripts/index.vue`: bảng kịch bản, lọc trạng thái + tìm tên, poll 5s khi có `writing`, toast khi xong.
  - `components/script/AiScriptForm.vue` (form chọn nhiều sản phẩm + template, dùng 2 chỗ), `AiScriptDialog.vue`, `ScriptEditorDialog.vue` (tự viết / xem / sửa; footer Lưu trữ · AI viết lại · Lưu · Tạo video; cảnh báo luật + link /products).
  - `components/video/CreateVideoDialog.vue`: 2 tab "Từ kịch bản có sẵn" (multi-select ready, tối đa 20, `Promise.allSettled`) / "AI viết kịch bản mới".
  - `pages/videos/index.vue`: bỏ toàn bộ logic duyệt kịch bản; hiện "Từ kịch bản" khi video có `scriptId`.
  - Đã xoá `components/video/ScriptReviewDialog.vue`; `pages/review.vue` về như main.

## Tiến độ
- [x] Core, worker, API, web code xong. `pnpm typecheck`, `pnpm lint`, `pnpm test` (51/51), `apps/web pnpm build` pass (2026-11-25).
- [ ] **Chưa chạy end-to-end trên trình duyệt** (cần API + worker + Temporal; hỏi người dùng trước khi bật Temporal — thường chỉ bật postgres).
  1. AI viết 2–3 sản phẩm → dòng "AI đang viết" → toast + nhãn "Mới".
  2. Tự viết → lưu → popup chuyển sang chế độ sửa → Tạo video.
  3. Sửa lời thoại ở 2 tab, lưu tab 2 → 409.
  4. Sản phẩm thiếu affiliate link → kịch bản lưu được, cảnh báo + Tạo video bị 400.
  5. CreateVideoDialog chọn nhiều kịch bản → đếm thành công/lỗi đúng.
- [x] Đã commit + merge vào `main` (2026-11-25).

## Bẫy môi trường
- Typecheck `pnpm typecheck` (không `pnpm -s`); API typecheck chậm, đặt timeout dài.
- Sửa nhiều file bằng Python: mở UTF-8, `newline=''`. Không dùng redirect của PowerShell 5.1.
- `git restore`/`checkout` nội dung file bị chặn bởi auto-mode → dùng Edit.
