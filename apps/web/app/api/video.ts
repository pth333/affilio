// Endpoint video — đổi đường dẫn chỉ cần sửa ở file này. Nuxt tự import `videoApi`.
// Lỗi tự hiện bằng message.error; truyền config { silent: true } nếu muốn tự xử lý ở chỗ gọi.
import type { AxiosRequestConfig } from 'axios';
import type { Page, ReviewDecision, VideoDetail, VideoListItem, VideoStatus } from '~/types';
import { http } from '~/utils/http';

export interface VideoListParams {
  status?: VideoStatus;
  cursor?: string;
  limit?: number;
}

const VIDEOS = '/videos';
const videoPath = (id: string): string => `${VIDEOS}/${encodeURIComponent(id)}`;

export const videoApi = {
  list: (params: VideoListParams = {}, config?: AxiosRequestConfig) => http.get<Page<VideoListItem>>(VIDEOS, { ...config, params }),
  detail: (id: string, config?: AxiosRequestConfig) => http.get<VideoDetail>(videoPath(id), config),
  create: (productId: string, config?: AxiosRequestConfig) => http.post<unknown>(VIDEOS, { productId }, config),
  /** Gửi kèm versionId: server từ chối nếu đã có bản mới hơn (tránh duyệt nhầm bản cũ). */
  review: (id: string, body: { versionId: string; decision: ReviewDecision }, config?: AxiosRequestConfig) =>
    http.post<unknown>(`${videoPath(id)}/review`, body, config),
  addNote: (id: string, body: { versionId: string; sceneId: string; text: string }, config?: AxiosRequestConfig) =>
    http.post<unknown>(`${videoPath(id)}/notes`, body, config),
};
