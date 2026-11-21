// Các hàm dùng lại nhiều nơi — gom vào một file (quy ước repo). Nuxt tự import, không cần `import`.
import axios from 'axios';

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
