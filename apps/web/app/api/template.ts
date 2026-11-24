// Endpoint template (định dạng kịch bản) — Nuxt tự import `templateApi`.
// Lỗi tự hiện bằng message.error; truyền config { silent: true } nếu muốn tự xử lý ở chỗ gọi.
import type { AxiosRequestConfig } from 'axios';
import type { ScriptTemplate } from '~/types';
import { http } from '~/utils/http';

export const templateApi = {
  /** Danh sách định dạng đang dùng được (hệ thống + của workspace). */
  getTemplates: (config?: AxiosRequestConfig) => http.get<{ items: ScriptTemplate[] }>('/templates', config),
};
