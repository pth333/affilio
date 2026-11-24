// Endpoint video — đổi đường dẫn chỉ cần sửa ở file này. Nuxt tự import `videoApi`.
// Lỗi tự hiện bằng message.error; truyền config { silent: true } nếu muốn tự xử lý ở chỗ gọi.
import type { AxiosRequestConfig } from 'axios';
import type { Page, ReviewDecision, ScriptSuggestion, VideoDetail, VideoListItem, VideoStatus } from '~/types';
import { http } from '~/utils/http';

export interface VideoListParams {
  status?: VideoStatus;
  cursor?: string;
  limit?: number;
}

const VIDEOS = '/videos';
const buildVideoPath = (id: string): string => `${VIDEOS}/${encodeURIComponent(id)}`;

export interface CreateVideoBody {
  productId: string;
  /** Định dạng kịch bản; bỏ trống = template mặc định. */
  templateId?: string;
  /** Kịch bản người dùng đã duyệt (spec trả về từ `suggestScript`, đã sửa nếu cần). */
  spec?: unknown;
}

export const videoApi = {
  getVideos: (params: VideoListParams = {}, config?: AxiosRequestConfig) => http.get<Page<VideoListItem>>(VIDEOS, { ...config, params }),
  getVideoDetail: (id: string, config?: AxiosRequestConfig) => http.get<VideoDetail>(buildVideoPath(id), config),
  /** AI gợi ý kịch bản theo template — chưa tạo video, để người dùng sửa trước. */
  suggestScript: (body: { productId: string; templateId: string }, config?: AxiosRequestConfig) =>
    http.post<ScriptSuggestion>(`${VIDEOS}/script`, body, config),
  /** Tạo video từ kịch bản đã duyệt (có `spec`) hoặc để AI viết trong workflow. */
  createVideo: (body: CreateVideoBody, config?: AxiosRequestConfig) =>
    http.post<{ video: { id: string }; workflowId: string }>(VIDEOS, body, config),
  /** Gửi kèm versionId: server từ chối nếu đã có bản mới hơn (tránh duyệt nhầm bản cũ). */
  submitReview: (id: string, body: { versionId: string; decision: ReviewDecision }, config?: AxiosRequestConfig) =>
    http.post<unknown>(`${buildVideoPath(id)}/review`, body, config),
  addSceneNote: (id: string, body: { versionId: string; sceneId: string; text: string }, config?: AxiosRequestConfig) =>
    http.post<unknown>(`${buildVideoPath(id)}/notes`, body, config),
  /** Người duyệt sửa tay lời thoại một cảnh: tạo phiên bản mới, video vẫn chờ duyệt. */
  updateScene: (id: string, sceneId: string, body: { versionId: string; narration: string }, config?: AxiosRequestConfig) =>
    http.patch<{ versionId: string; versionNo: number }>(
      `${buildVideoPath(id)}/scenes/${encodeURIComponent(sceneId)}`,
      body,
      config,
    ),
  /** Nhờ AI viết lại một cảnh; video tạm rời hộp duyệt rồi tự quay lại khi worker xong. */
  reviseScene: (id: string, sceneId: string, body: { versionId: string; instruction?: string }, config?: AxiosRequestConfig) =>
    http.post<{ workflowId: string }>(`${buildVideoPath(id)}/scenes/${encodeURIComponent(sceneId)}/revise`, body, config),
};
