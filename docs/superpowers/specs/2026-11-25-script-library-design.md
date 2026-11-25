# Thư viện kịch bản — tách "Kịch bản" thành mục riêng

Ngày: 2026-11-25 · Nhánh: `feature/async-script-drafting` (chưa commit)

## 1. Mục đích
Hiện kịch bản là một `video_version` gắn chặt vào một video (video dừng ở `script_review` chờ duyệt). Người dùng muốn:
- **Kịch bản là mục riêng** (trang "Kịch bản"), quản lý độc lập với video.
- Tạo kịch bản **bằng AI** (chạy nền trên worker như hiện tại) hoặc **tự viết** (không gọi AI).
- **Tạo video từ kịch bản**: chọn kịch bản trong popup tạo video, hoặc bấm "Tạo video" ngay trên kịch bản.

## 2. Mục tiêu / không làm / phản mục tiêu
**Mục tiêu**
- Kịch bản có vòng đời riêng: AI đang viết → sẵn sàng → (dùng để tạo video, nhiều lần) → lưu trữ.
- Một kịch bản tạo được **nhiều video** (dựng lại, thử nhiều lần). Video giữ **bản sao** spec lúc tạo.
- Đường tắt cho người làm hàng loạt: từ popup tạo video vẫn bấm được "AI viết kịch bản mới"; từ kịch bản bấm "Tạo video" ngay.
- Kiểm luật cứng (`checkHardRules`) chạy **lúc lưu kịch bản**, không đợi tới lúc dựng.

**Không làm (lần này)**
- Tự động tạo video khi AI viết xong (bỏ bước duyệt).
- Sửa hình ảnh/prompt ảnh từng cảnh trong trình soạn kịch bản (chỉ sửa lời thoại; hình ảnh tự gán như AI đang làm).
- Đổi luồng CLI `POST /videos {productId, templateId?}` (AI viết + dựng luôn) — giữ nguyên.
- Sửa kịch bản thì video đã tạo tự cập nhật — **không**; video độc lập sau khi tạo.

**Phản mục tiêu (làm xong mà dính những điều này là hỏng)**
- Người chỉ muốn "AI viết rồi dựng" phải đi vòng nhiều trang hơn trước.
- Kịch bản tự viết qua được lưu nhưng tới lúc dựng mới bị `rejected_auto`.
- Người dùng chờ LLM đồng bộ ở bất kỳ popup nào.

## 3. Ràng buộc
- Bảng mới ⇒ **migration mới** `0002_*` (không sửa 0000/0001).
- TS strict, không `any`/`as` bịt lỗi; comment + UI tiếng Việt.
- Hàm tái sử dụng gom vào một file: core → `packages/core/src/script/index.ts`; web → `apps/web/app/utils/helpers.ts`.
- Dev chỉ bật postgres; Temporal tắt ⇒ chưa chạy E2E được nếu người dùng không bật.

## 4. Các phương án đã cân nhắc
| | Phương án | Đánh đổi |
|---|---|---|
| **A (chọn)** | Bảng `script` + `script_version` riêng; video tạo từ kịch bản bằng cách chép spec vào `video_version` | Cần migration + sửa worker/API/web nhiều; đổi lại kịch bản tự viết, tái sử dụng, lọc/quản lý đều tự nhiên |
| B | Giữ kịch bản = video ở `script_review`, chỉ tách UI | Ít sửa, nhưng không tái sử dụng được (1 kịch bản = 1 video), kịch bản tự viết phải giả làm video, danh sách video lẫn "video chưa có gì" |
| C | Bảng `script` nhưng không có version (ghi đè spec) | Đơn giản hơn A, nhưng mất lịch sử "AI viết lại" và không phát hiện xung đột 2 tab (409) |

Người dùng chốt hướng sản phẩm "tách mục Kịch bản + giữ đường tắt". Chọn A là quyết định của mình vì B không tái sử dụng được, C mất khả năng chống ghi đè đang có.

## 5. Thiết kế

### 5.1 Dữ liệu (migration 0002)
`script`
- `id`, `workspace_id` → workspace, `product_id` → product
- `template_id`, `template_version` (template là **một phần của kịch bản**; tạo video không chọn lại template)
- `origin`: `'ai' | 'manual'`
- `status`: `'writing' | 'ready' | 'failed' | 'archived'` (cột `text`, enum ở TS)
- `current_version_id` (null khi AI chưa viết xong)
- `failed_reason`
- `created_by` → user, `created_at`, `updated_at`
- index `(workspace_id, status, updated_at)`, `(product_id)`

`script_version` (chỉ thêm, không sửa — giống `video_version`)
- `id`, `script_id` → script (cascade), `version_no` (unique theo script), `parent_version_id`
- `spec` jsonb (`VideoSpec`), `spec_hash`
- `source`: `'ai_draft' | 'user_edit'`
- `rules` jsonb (`RuleResult[]`), `passed` boolean — kết quả kiểm luật lúc lưu
- `author_user_id`, `change_summary`, `created_at`

`video`: thêm cột `script_id` (nullable, → script) và `script_version_id` (nullable) để truy ngược video tạo từ kịch bản nào.

`VERSION_SOURCES` (video_version) thêm `'from_script'` — cột text, không cần migration riêng.

### 5.2 Vòng đời kịch bản
```
AI:     tạo (writing) ──worker──▶ ready | failed
                 ready/failed ──"AI viết lại"──▶ writing ──▶ ready (version mới, parent = bản cũ) | failed
Tự viết: tạo ──▶ ready (version user_edit đầu tiên)
Sửa (ready): lưu → version user_edit mới nếu spec_hash khác; versionId gửi lên lệch current → 409
Lưu trữ: ready|failed → archived (ẩn khỏi danh sách mặc định, không xoá vì video có thể tham chiếu)
```
- Kịch bản AI viết xong hiện nhãn **"Mới"** (chưa ai mở/sửa/dùng) để người dùng biết cần xem: suy ra từ `current version.source = 'ai_draft'` và chưa có video nào dùng — không thêm cột.
- Hết hạn mức LLM: workflow ngủ tới `retryAt` (giữ cơ chế hiện có), kịch bản vẫn `writing`.

### 5.3 Tự viết kịch bản
- Chọn sản phẩm + template → hiện khung cảnh theo `template.content.scenes` (role + brief làm gợi ý), người dùng điền lời thoại từng cảnh (≤400 ký tự).
- Hình ảnh gán tự động bằng cùng logic `buildDraftSpec` hiện có (cảnh demo/proof hoặc cảnh không có prompt → ảnh sản phẩm xoay vòng; còn lại → ảnh AI với prompt mặc định). Tách phần "ghép cảnh → spec" của `buildDraftSpec` thành hàm dùng chung `assembleSpec(...)` để cả AI và tự viết dùng.
- Sửa kịch bản (`PUT`): ghép lời thoại **theo thứ tự cảnh**, số phần tử phải bằng số cảnh của version hiện tại (lệch → 400). Chỉ thay `narration` (cảnh bị sửa gắn `lock: 'user_edit'`); giữ nguyên `visual`, `voice`, `mascot`… của từng cảnh — không chạy lại `assembleSpec`. `assembleSpec` chỉ dùng khi tạo mới (AI hoặc tự viết). Spec sau khi ghép đi qua `validateSpec`.
- Sản phẩm không có ảnh: cảnh demo/proof bị bỏ (giống AI) — UI báo trước "sản phẩm chưa có ảnh, cảnh X sẽ bị bỏ".

### 5.4 Tạo video từ kịch bản
- `POST /scripts/:id/videos {versionId}` (hoặc nhiều: `POST /videos/from-scripts {items:[{scriptId, versionId}]}` cho popup chọn nhiều).
- Trong một transaction: tạo `video` (`product_id`, `template_*` lấy từ kịch bản, `script_id`, `script_version_id`, status `auto_check`) + `video_version` (`source='from_script'`, spec chép nguyên) → sau commit start `videoDraftWorkflow({versionId})` — **tái dùng đúng nhánh `confirmedVersionId` đang có** của `draftVideo` (không gọi LLM, `auto_check → previewing`).
- **Kiểm luật lại lúc tạo video** với dữ liệu sản phẩm hiện tại (link affiliate, ảnh có thể đã đổi sau khi lưu kịch bản). Không qua → 400 kèm danh sách luật, không tạo video. `rules/passed` lưu trên version chỉ để hiện cảnh báo trong trình soạn.
- Luật không sửa được bằng lời thoại (`affiliate_link`, ảnh sản phẩm…): vẫn cho lưu kịch bản; UI cảnh báo kèm link sang trang Sản phẩm để bổ sung, rồi quay lại bấm "Tạo video".
- Start workflow lỗi → video `failed` (giữ cơ chế `markVideoFailed` hiện có).

### 5.5 API (`apps/api/src/routes/scripts.ts`, controller/service/repository như các route khác)
| Method | Path | Body | Trả về |
|---|---|---|---|
| GET | `/scripts` | query: `status?`, `productId?`, `q?`, phân trang | danh sách + product name + số video đã tạo |
| GET | `/scripts/:id` | – | script + version hiện tại + rules + template content |
| POST | `/scripts/ai` | `{productIds[1..20], templateId}` | 202 `{items:[{script, workflowId\|null}]}` |
| POST | `/scripts` | `{productId, templateId, scenes:[{narration}]}` | 201 script (ready) |
| PUT | `/scripts/:id` | `{versionId, scenes:[{narration}]}` | 200 script; 409 nếu versionId cũ |
| POST | `/scripts/:id/regenerate` | – | 202 |
| POST | `/scripts/:id/archive` | – | 200 |
| POST | `/scripts/:id/videos` | `{versionId}` | 202 `{video, workflowId}` |
Lỗi: `not_found`→404, `invalid`→400, `stale_version`/`wrong_status`→409 (tái dùng kiểu `scriptActionError`).

### 5.6 Worker
- `videoScriptWorkflow`/`draftScript` đổi sang làm việc với **script**: input `{workspaceId, scriptId}`, ghi `script_version` + rules, `writing → ready`. Workflow ID `script.write:${scriptId}:${fromVersionId ?? 'initial'}`. Idempotent như hiện tại (đã `ready` với version của lần này → trả lại).
- `generateSpec` nhận `scriptId` thay `videoId` cho log; `ai_call_log.video_id` để null, `job_id` = workflowId (không thêm cột).

### 5.7 Web
- Sidebar thêm mục **"Kịch bản"** (`/scripts`), đặt ngay trên "Video".
- `pages/scripts/index.vue`: bảng kịch bản (sản phẩm, template, nguồn AI/Tự viết, trạng thái + nhãn "Mới", số video đã tạo, cập nhật lúc), lọc trạng thái/sản phẩm, poll 5s khi có `writing`, toast khi AI viết xong. Nút: "AI viết kịch bản" (popup chọn nhiều sản phẩm — chuyển `CreateVideoDialog` hiện tại sang), "Tự viết".
- `ScriptEditorDialog.vue` (thay `ScriptReviewDialog`): một popup cho cả tạo tay / xem / sửa; footer: Lưu trữ · AI viết lại · Lưu · **Tạo video**; hiện cảnh báo luật.
- `CreateVideoDialog` mới trên trang Video: tab **"Từ kịch bản có sẵn"** (chọn nhiều kịch bản `ready`, tìm/lọc theo sản phẩm — không lọc theo kênh vì kênh chưa có trong DB) và tab **"AI viết kịch bản mới"** (gửi `POST /scripts/ai`, đóng ngay, toast có link sang trang Kịch bản).
- Trang Video: bỏ toàn bộ phần `script_review` (nút "Duyệt kịch bản", `?script=`, gợi ý "AI đang viết…"); cột sản phẩm hiện thêm "từ kịch bản #…" khi có `script_id`.
- `review.vue`: bỏ khối thông báo giai đoạn kịch bản (video giờ luôn bắt đầu từ `auto_check` hoặc CLI).

### 5.8 Dọn luồng cũ
Luồng video `script_review` chỉ có trên nhánh này (chưa lên main) ⇒ **xoá hẳn**: trạng thái `script_review`, `requestScripts/confirmScript/regenerateScript/discardScript` (core), endpoint `/videos/scripts` + `/videos/:id/script/*`, `ScriptReviewDialog`, `isScriptPhase/isScriptWriting`, nhãn "Chờ AI viết kịch bản" (trả về nhãn cũ). Video dev còn kẹt ở `script_review` trong DB local: bỏ qua (dữ liệu thử), không viết migration dữ liệu.

## 6. Quyết định của mình (người dùng chưa xác nhận riêng)
- Phương án A (2 bảng có version).
- 1 kịch bản → nhiều video; video giữ bản sao.
- Template gắn với kịch bản; tạo video không chọn lại template.
- Tự viết chỉ nhập lời thoại; hình ảnh tự gán.
- Chặn "Tạo video" khi luật cứng không qua.
- Lưu trữ thay vì xoá.
- Xoá hẳn luồng `script_review` trên video.
- Kiểm luật lại lúc tạo video; luật thuộc về sản phẩm thì cho lưu kịch bản, chỉ chặn lúc tạo video.
- Sửa kịch bản = ghép lời thoại theo thứ tự cảnh, giữ nguyên hình ảnh.
- Không lọc kịch bản theo kênh.

## 7. Để lại cho người làm
- Tên file/component cụ thể, cách chia controller/service/repository theo mẫu sẵn có.
- Phân trang `GET /scripts` (theo mẫu `GET /videos`).
- Test: core `script/index.ts` (assembleSpec, chuyển trạng thái, 409 stale), worker workflow test cập nhật theo script; mock LLM/Temporal.
- Kiểm chứng: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `apps/web pnpm build`; E2E cần bật Temporal (hỏi người dùng trước).
