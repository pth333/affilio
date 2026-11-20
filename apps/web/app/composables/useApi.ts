/** Gọi API cùng origin; lỗi trả về message của server (đã ẩn chi tiết nội bộ ở phía API). */
export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = err.data;
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') return data.message;
  }
  return err instanceof Error ? err.message : 'Lỗi không xác định';
}

export const api = $fetch.create({ baseURL: '/api' });
