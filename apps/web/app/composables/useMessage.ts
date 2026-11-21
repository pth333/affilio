// Thông báo nhanh (toast) dùng chung toàn app. Nuxt tự import `message` nên ở bất kỳ đâu chỉ cần gọi:
//   message.success('Đã lưu')   message.error('Lỗi…')   message.warning('…')   message.info('…')
// Hiển thị bởi <AppMessage /> đặt sẵn trong app.vue.

export type MessageType = 'success' | 'error' | 'warning' | 'info';

export interface MessageItem {
  id: number;
  type: MessageType;
  text: string;
}

export interface MessageOptions {
  /** Thời gian hiển thị (ms). 0 = không tự đóng. Mặc định 4500ms. */
  duration?: number;
}

const DEFAULT_DURATION = 4500;
/** Giữ tối đa bấy nhiêu thông báo cùng lúc; cái cũ nhất bị đẩy ra. */
const MAX_VISIBLE = 3;

const items = ref<MessageItem[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let seq = 0;

function close(id: number): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  items.value = items.value.filter((m) => m.id !== id);
}

function show(type: MessageType, text: string, options: MessageOptions = {}): number {
  // Cùng nội dung đang hiện thì làm mới lại thay vì chồng thêm (vd. nhiều request lỗi một lúc).
  const dup = items.value.find((m) => m.type === type && m.text === text);
  if (dup) close(dup.id);

  const id = ++seq;
  items.value = [...items.value, { id, type, text }].slice(-MAX_VISIBLE);
  const duration = options.duration ?? DEFAULT_DURATION;
  if (duration > 0) timers.set(id, setTimeout(() => close(id), duration));
  return id;
}

function clear(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  items.value = [];
}

export const message = {
  success: (text: string, options?: MessageOptions) => show('success', text, options),
  error: (text: string, options?: MessageOptions) => show('error', text, options),
  warning: (text: string, options?: MessageOptions) => show('warning', text, options),
  info: (text: string, options?: MessageOptions) => show('info', text, options),
  close,
  clear,
};

/** Chỉ dành cho <AppMessage /> — đọc danh sách đang hiển thị. */
export function useMessageList() {
  return { items: readonly(items), close };
}
