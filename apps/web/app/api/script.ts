// Endpoint thư viện kịch bản — đổi đường dẫn chỉ cần sửa ở file này. Nuxt tự import `scriptApi`.
// Lỗi tự hiện bằng message.error; truyền config { silent: true } nếu muốn tự xử lý ở chỗ gọi.
import type { AxiosRequestConfig } from 'axios';
import type { AiScriptRequestResult, Page, ScriptDetail, ScriptListItem, ScriptRecord, ScriptStatus } from '~/types';
import { http } from '~/utils/http';

export interface ScriptListParams {
  status?: ScriptStatus;
  productId?: string;
  /** Tìm theo tên sản phẩm. */
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Lời thoại theo đúng thứ tự cảnh của template. */
export interface ScriptScenesBody {
  scenes: { narration: string }[];
}

const SCRIPTS = '/scripts';
const buildScriptPath = (id: string): string => `${SCRIPTS}/${encodeURIComponent(id)}`;

export const scriptApi = {
  getScripts: (params: ScriptListParams = {}, config?: AxiosRequestConfig) =>
    http.get<Page<ScriptListItem>>(SCRIPTS, { ...config, params }),
  getScriptDetail: (id: string, config?: AxiosRequestConfig) => http.get<ScriptDetail>(buildScriptPath(id), config),
  /** Giao AI viết kịch bản cho nhiều sản phẩm (mỗi sản phẩm một kịch bản); trả về ngay, AI viết ở nền. */
  requestAi: (body: { productIds: string[]; templateId: string }, config?: AxiosRequestConfig) =>
    http.post<AiScriptRequestResult>(`${SCRIPTS}/ai`, body, config),
  /** Người dùng tự viết kịch bản (không gọi AI). */
  createManual: (body: ScriptScenesBody & { productId: string; templateId: string }, config?: AxiosRequestConfig) =>
    http.post<ScriptRecord>(SCRIPTS, body, config),
  /** Lưu lời thoại; `versionId` là bản đang xem — server trả 409 nếu đã có bản mới hơn. */
  updateScript: (id: string, body: ScriptScenesBody & { versionId: string }, config?: AxiosRequestConfig) =>
    http.put<{ script: ScriptRecord; versionId: string }>(buildScriptPath(id), body, config),
  /** AI viết lại toàn bộ kịch bản ở nền. */
  regenerate: (id: string, config?: AxiosRequestConfig) =>
    http.post<{ script: ScriptRecord; workflowId: string }>(`${buildScriptPath(id)}/regenerate`, {}, config),
  archive: (id: string, config?: AxiosRequestConfig) => http.post<ScriptRecord>(`${buildScriptPath(id)}/archive`, {}, config),
  /** Tạo video từ đúng phiên bản đang xem → worker dựng preview (không gọi AI viết kịch bản). */
  createVideo: (id: string, body: { versionId: string }, config?: AxiosRequestConfig) =>
    http.post<{ video: { id: string }; workflowId: string }>(`${buildScriptPath(id)}/videos`, body, config),
};
