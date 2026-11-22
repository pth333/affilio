// Các hàm dùng lại nhiều nơi — gom vào một file (quy ước repo). Nuxt tự import, không cần `import`.
import axios from 'axios';
import type { Channel, LibraryProduct, ProductSuggestion, SuggestionReason } from '~/types';

const LOCALE = 'vi-VN';

// ───────────── Số & tiền ─────────────

/** 3842 → "3.842" */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** 128500 → "128,5K"; 2400000 → "2,4M" */
export function formatCompact(value: number): string {
  if (Math.abs(value) < 1000) return formatNumber(value);
  const units = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ];
  const unit = units.find((u) => Math.abs(value) >= u.v) ?? { v: 1e3, s: 'K' };
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value / unit.v)}${unit.s}`;
}

/** 289000 → "289.000đ" */
export function formatCurrency(value: number): string {
  return `${formatNumber(value)}đ`;
}

/** 76.8 → "76,8%"; signed=true: 24.6 → "+24,6%" */
export function formatPercent(value: number, signed = false): string {
  const text = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value);
  return `${signed && value > 0 ? '+' : ''}${text}%`;
}

/** Giới hạn trong [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ───────────── Ngày giờ ─────────────

/** "Thứ hai, 18 tháng 5, 2026" */
export function formatLongDate(date: Date = new Date()): string {
  const text = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** ISO string/Date → "09:15 21/11/2026" */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(LOCALE, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Lời chào theo giờ trong ngày. */
export function getGreetingByHour(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// ───────────── Chuỗi ─────────────

/** "Minh Anh" → "MA"; "Góc Công Nghệ" (max=1) → "G" */
export function getInitials(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

// ───────────── Gợi ý sản phẩm theo kênh ─────────────

/** "Đồ công nghệ dưới 300K" → 300000; "dưới 1,5tr" → 1500000; không có mức giá → null. */
export function parseMaxPrice(text: string): number | null {
  const match = /(?:dưới|<)\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|tr|triệu)?/iu.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(',', '.'));
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === 'k' || unit === 'nghìn' ? 1_000 : unit === 'tr' || unit === 'triệu' ? 1_000_000 : 1;
  return Number.isFinite(value) ? value * multiplier : null;
}

/**
 * Chấm điểm sản phẩm theo định hướng kênh: cùng ngành hàng (bắt buộc), giá nằm trong mức của series, đã có clip.
 * Trả về danh sách giảm dần theo điểm; sản phẩm khác ngành bị loại.
 */
export function suggestProductsForChannel(channel: Channel, products: readonly LibraryProduct[]): ProductSuggestion[] {
  const maxPrice = parseMaxPrice(channel.series);
  return products
    .filter((product) => product.category.toLowerCase() === channel.tag.toLowerCase())
    .map((product) => {
      let score = 60;
      const reasons: SuggestionReason[] = [{ label: 'Đúng ngành hàng', matched: true }];
      if (maxPrice !== null) {
        if (product.price <= maxPrice) {
          score += 25;
          reasons.push({ label: `Trong mức ${formatCurrency(maxPrice)}`, matched: true });
        } else {
          reasons.push({ label: `Vượt mức ${formatCurrency(maxPrice)}`, matched: false });
        }
      } else {
        score += 10;
      }
      if (product.hasClip) {
        score += 15;
        reasons.push({ label: 'Có clip sẵn', matched: true });
      }
      return { product, score: Math.min(score, 100), reasons };
    })
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price);
}

// ───────────── Tệp người dùng tải lên ─────────────

/** 1536 → "1,5 KB"; 12_582_912 → "12 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(value)} ${units[unit] ?? 'B'}`;
}

/** Kiểm tra file là ảnh (dựa trên MIME). */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Kiểm tra file là video (dựa trên MIME). */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/** Đọc file thành data URL để xem trước; từ chối khi trình duyệt không đọc được. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Không đọc được tệp')));
    reader.onerror = () => reject(reader.error ?? new Error('Không đọc được tệp'));
    reader.readAsDataURL(file);
  });
}

// ───────────── Màu nhấn ─────────────

/** Bảng màu nhấn ấm, lấy xoay vòng theo tên để sản phẩm/kênh mới luôn có màu ổn định. */
const ACCENT_COLORS = ['#c9382a', '#4f8a58', '#cf7c2e', '#3f6f9e', '#a2476b', '#7c5aa6'] as const;

/** "Quạt mini Jisulife" → một màu trong ACCENT_COLORS (cùng tên luôn ra cùng màu). */
export function pickAccentColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ACCENT_COLORS[hash % ACCENT_COLORS.length] ?? ACCENT_COLORS[0];
}

// ───────────── Trình duyệt ─────────────

/** Sao chép vào clipboard; trả về false nếu trình duyệt không cho phép. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.warn('[copyToClipboard] bị trình duyệt chặn', err);
    return false;
  }
}

// ───────────── Lỗi ─────────────

/** Rút ra câu thông báo lỗi hiển thị được cho người dùng (API đã ẩn chi tiết nội bộ). */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') return 'Máy chủ phản hồi quá lâu, vui lòng thử lại.';
    if (!err.response) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    const data: unknown = err.response.data;
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' && data.message) {
      return data.message;
    }
    if (err.response.status >= 500) return 'Máy chủ đang gặp sự cố, vui lòng thử lại sau.';
    if (err.response.status === 404) return 'Không tìm thấy dữ liệu yêu cầu.';
    if (err.response.status === 401 || err.response.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  }
  return err instanceof Error && err.message ? err.message : 'Lỗi không xác định';
}
