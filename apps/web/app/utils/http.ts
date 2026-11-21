// HTTP client dùng chung (axios) + interceptor.
// Trang KHÔNG gọi `http` với URL trực tiếp — khai báo endpoint trong app/api/<tài nguyên>.ts rồi dùng videoApi/productApi…
// Lỗi tự hiện bằng message.error; truyền { silent: true } nếu muốn tự xử lý ở chỗ gọi.
import axios, { type AxiosRequestConfig } from 'axios';
import { message } from '~/composables/useMessage';
import { getErrorMessage } from '~/utils/helpers';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** true: không tự hiện thông báo lỗi. */
    silent?: boolean;
  }
}

const client = axios.create({
  baseURL: '/api', // cùng origin: Caddy proxy ở prod, nitro devProxy ở dev
  timeout: 20_000,
  headers: { Accept: 'application/json' },
});

// ── Request: gắn request id để nối log client ↔ API (API nhận header x-request-id).
//    Khi có đăng nhập, gắn Authorization tại đây.
client.interceptors.request.use((config) => {
  config.headers.set('x-request-id', crypto.randomUUID());
  return config;
});

// ── Response: trả nguyên response; lỗi → thông báo chung rồi ném tiếp cho nơi gọi.
client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // Request bị huỷ chủ động (AbortController) thì không báo lỗi.
    if (axios.isCancel(error)) return Promise.reject(error);
    if (axios.isAxiosError(error)) {
      const requestId: unknown = error.response?.headers['x-request-id'];
      console.error(`[http] ${error.config?.method?.toUpperCase()} ${error.config?.url} → ${error.response?.status ?? error.code}`, { requestId });
      if (!error.config?.silent) message.error(getErrorMessage(error));
    } else {
      message.error(getErrorMessage(error));
    }
    return Promise.reject(error);
  },
);

/** Các hàm trả thẳng `data` đã gõ kiểu. */
export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) => client.get<T>(url, config).then((r) => r.data),
  delete: <T>(url: string, config?: AxiosRequestConfig) => client.delete<T>(url, config).then((r) => r.data),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => client.post<T>(url, body, config).then((r) => r.data),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => client.put<T>(url, body, config).then((r) => r.data),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => client.patch<T>(url, body, config).then((r) => r.data),
  /** Instance gốc khi cần upload/progress… */
  client,
};
