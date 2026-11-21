import type { z } from 'zod';

/**
 * Nơi duy nhất chứa các hàm có thể tái sử dụng của API (xem CLAUDE.md): lỗi nghiệp vụ,
 * validate đầu vào, phân trang. Không phụ thuộc Fastify để controller/service/repository
 * đều dùng lại được.
 */

/** Một lỗi ở cấp trường dữ liệu — trả về client trong `issues`. */
export interface FieldIssue {
  path: string;
  message: string;
}

/** Lỗi nghiệp vụ kèm mã HTTP. Service ném ra, app.ts đổi thành response thống nhất. */
export class AppError extends Error {
  readonly statusCode: number;
  /** Nhãn ngắn kiểu HTTP để client phân loại, vd. "Not Found". */
  readonly error: string;
  /** Chi tiết từng trường khi lỗi do dữ liệu đầu vào. */
  readonly issues?: FieldIssue[];

  constructor(statusCode: number, error: string, message: string, issues?: FieldIssue[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error;
    this.issues = issues;
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, 'Bad Request', message);
}

export function notFound(message: string): AppError {
  return new AppError(404, 'Not Found', message);
}

export function conflict(message: string): AppError {
  return new AppError(409, 'Conflict', message);
}

/** Danh sách lỗi từng trường của Zod, dùng chung cho validate() và error handler. */
export function formatZodIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/**
 * Validate dữ liệu đầu vào bằng schema Zod. Sai thì ném 400 kèm lỗi từng trường,
 * nhờ vậy controller không phải tự kiểm tra kiểu.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, 'Bad Request', 'Dữ liệu gửi lên không hợp lệ', formatZodIssues(result.error));
  }
  return result.data;
}

/** Một trang kết quả theo con trỏ — khớp kiểu `Page<T>` phía web. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Cắt `rows` (đã lấy dư 1 dòng) thành một trang: còn dòng thừa nghĩa là còn trang sau,
 * con trỏ là id của dòng cuối trang (id ULID tăng dần theo thời gian nên ổn định hơn offset).
 */
export function toPage<T extends { id: string }>(rows: readonly T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}
