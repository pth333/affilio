// Kiểu dữ liệu API trả về (giữ tối thiểu, khớp apps/api/src/routes/*).
import type { IconName } from '~/utils/icons';

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
  /** Thời lượng đã đặt (giây); null = lấy theo độ dài TTS/ước tính. */
  duration?: number | null;
  /** Khóa cảnh: null = AI được sửa, user/user_edit = người dùng đã sửa tay. */
  lock?: 'user' | 'user_edit' | null;
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

// ───────────── Dữ liệu giao diện (hiện đang dùng mock ở data/mock.ts) ─────────────

export type Tone = 'primary' | 'ok' | 'warn' | 'bad' | 'info' | 'muted';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  count?: number;
}

export interface Channel {
  id: string;
  name: string;
  handle: string;
  tag: string;
  color: string;
  status: 'active' | 'archived';
  followers: number;
  growth: number;
  views: number;
  videos: number;
  series: string;
  pending: number;
  published: number;
  /** Lượt xem theo ngày, dùng vẽ biểu đồ đường. */
  trend: number[];
}

/** Clip người dùng kéo thả vào thư viện (URL tạm, chỉ sống trong phiên hiện tại). */
export interface ProductClip {
  id: string;
  name: string;
  size: number;
  url: string;
}

export interface LibraryProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  affiliateUrl: string;
  hasClip: boolean;
  color: string;
  /** Ảnh sản phẩm (data URL khi người dùng tải lên). */
  imageUrl?: string | null;
  clips?: ProductClip[];
}

/** Định dạng kịch bản cho popup tạo video. */
export interface VideoFormat {
  id: string;
  name: string;
  description: string;
  glyph: string;
}

export interface DraftScene {
  role: 'Mở đầu' | 'Thông tin' | 'Trải nghiệm' | 'Kêu gọi';
  start: number;
  end: number;
  text: string;
}

export interface Draft {
  id: string;
  productName: string;
  channelName: string;
  hook: string;
  score: number;
  price: number;
  createdAt: string;
  duration: number;
  color: string;
  scenes: DraftScene[];
  checks: { label: string; passed: boolean }[];
}

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  glyph: string;
  cover: string;
  structure: string[];
  completionRate: number;
  clickRate: number;
  system: boolean;
}

export interface PublishItem {
  id: string;
  productName: string;
  channelName: string;
  caption: string;
  hashtags: string[];
  affiliateUrl: string;
  approvedAt: string;
  color: string;
}

/** Một tiêu chí khi chấm điểm gợi ý; matched=false là điểm trừ (vd. vượt giá). */
export interface SuggestionReason {
  label: string;
  matched: boolean;
}

/** Sản phẩm được gợi ý cho một kênh, kèm điểm phù hợp (0–100) và lý do. */
export interface ProductSuggestion {
  product: LibraryProduct;
  score: number;
  reasons: SuggestionReason[];
}
