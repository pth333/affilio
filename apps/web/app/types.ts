// Kiểu dữ liệu API trả về (giữ tối thiểu, khớp apps/api/src/routes/*).

export const VIDEO_STATUSES = [
  'queued', 'drafting', 'auto_check', 'previewing', 'pending_review', 'approved', 'rendering',
  'ready', 'published', 'rejected_auto', 'rejected', 'needs_changes', 'revising', 'failed',
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];
export type ReviewDecision = 'approve' | 'reject' | 'needs_changes';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface VideoListItem {
  id: string;
  status: VideoStatus;
  productId: string;
  productName: string;
  currentVersionId: string | null;
  failedReason: string | null;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  affiliateUrl: string;
  description: string | null;
  category: string | null;
}

export interface Scene {
  id: string;
  role: string;
  narration: string;
  visual: { type: 'image' | 'ai_image' | 'ai_clip'; prompt?: string; asset_id: string | null; motion: string };
}

export interface VideoDetail {
  video: { id: string; status: VideoStatus; currentVersionId: string | null; failedReason: string | null; failedStep: string | null; updatedAt: string };
  product: Product;
  version: { id: string; versionNo: number; source: string; spec: { scenes: Scene[] }; createdAt: string } | null;
  check: { passed: boolean; rules: { rule: string; passed: boolean; message?: string }[] } | null;
  notes: { id: string; sceneId: string; text: string; status: string; createdAt: string }[];
  reviews: { id: string; decision: ReviewDecision; createdAt: string }[];
}

export const STATUS_LABEL: Record<VideoStatus, string> = {
  queued: 'Chờ xử lý', drafting: 'Đang viết', auto_check: 'Đang kiểm tra', previewing: 'Đang dựng preview',
  pending_review: 'Chờ duyệt', approved: 'Đã duyệt', rendering: 'Đang render', ready: 'Sẵn sàng',
  published: 'Đã đăng', rejected_auto: 'Bị luật chặn', rejected: 'Bị từ chối', needs_changes: 'Cần sửa',
  revising: 'Đang sửa', failed: 'Lỗi',
};
