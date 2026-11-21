import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type Dirent } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AppConfig } from '#src/config/index.ts';

/**
 * Storage cục bộ: mọi tệp nằm dưới `STORAGE_DIR`, DB chỉ lưu `storage_key` tương đối
 * (xem bảng `asset`). Muốn thêm driver khác (S3/R2) thì mở rộng `STORAGE_DRIVER` rồi
 * rẽ nhánh trong `createStorage()`.
 */

/** Kết quả ghi một tệp: đủ dữ liệu để tạo dòng `asset` (sha256 dùng để dedupe theo workspace). */
export interface StoredObject {
  /** Khóa tương đối, đã chuẩn hoá. */
  key: string;
  /** Đường dẫn tuyệt đối — cho ffmpeg hoặc tiến trình khác đọc trực tiếp. */
  path: string;
  size: number;
  sha256: string;
}

export interface Storage {
  /** Thư mục gốc tuyệt đối. */
  readonly root: string;
  /** Đường dẫn tuyệt đối của một khóa. */
  path(key: string): string;
  /** Ghi đè nội dung; tự tạo thư mục cha. */
  put(key: string, data: Buffer | Uint8Array | string): Promise<StoredObject>;
  /** Đưa một tệp đã có trên đĩa (vd. ffmpeg xuất ra) vào storage. */
  putFile(key: string, sourcePath: string): Promise<StoredObject>;
  /** Đọc toàn bộ nội dung; null nếu chưa có. */
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  /** Xoá; trả false nếu không có tệp. */
  remove(key: string): Promise<boolean>;
  /** Các khóa dưới `prefix` (mặc định cả storage), sắp xếp tăng dần. */
  list(prefix?: string): Promise<string[]>;
}

/** Ký tự cho phép trong khóa: chữ, số, `_`, `-`, `.`, `/`. */
const KEY_PATTERN = /^[\w.-]+(?:\/[\w.-]+)*$/;

/**
 * Chuẩn hoá khóa tương đối trước khi ghép vào đường dẫn đĩa: bỏ `/` đầu cuối, đổi `\` thành `/`,
 * chặn `.`/`..` và đường dẫn tuyệt đối để không ghi ra ngoài `STORAGE_DIR`.
 */
export function normalizeStorageKey(key: string): string {
  const normalized = key.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) throw new Error('khóa storage rỗng');
  if (normalized.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error(`khóa storage không hợp lệ: ${key}`);
  }
  if (!KEY_PATTERN.test(normalized)) throw new Error(`khóa storage không hợp lệ: ${key}`);
  return normalized;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

/** sha256 theo luồng để không phải nạp cả tệp render vào RAM. */
async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function describe(key: string, filePath: string): Promise<StoredObject> {
  const [info, sha256] = await Promise.all([stat(filePath), sha256File(filePath)]);
  return { key, path: filePath, size: info.size, sha256 };
}

/** Ghi ra tệp tạm cùng thư mục rồi đổi tên — không bao giờ để lại tệp dở dang. */
async function writeAtomic(target: string, write: (tmpPath: string) => Promise<void>): Promise<void> {
  const tmpPath = `${target}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(target), { recursive: true });
    await write(tmpPath);
    await rename(tmpPath, target);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

/** Duyệt đệ quy, trả về khóa dạng `a/b/c.mp4`. */
async function collectKeys(dir: string, prefix = ''): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
  const keys: string[] = [];
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) keys.push(...(await collectKeys(join(dir, entry.name), key)));
    else if (entry.isFile()) keys.push(key);
  }
  return keys;
}

export function createLocalStorage(dir: string): Storage {
  const root = resolve(dir);

  const targetOf = (key: string): { key: string; target: string } => {
    const normalized = normalizeStorageKey(key);
    return { key: normalized, target: join(root, ...normalized.split('/')) };
  };

  const existsAt = async (target: string): Promise<boolean> => {
    try {
      await stat(target);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  };

  return {
    root,

    path(key) {
      return targetOf(key).target;
    },

    async put(key, data) {
      const { key: normalized, target } = targetOf(key);
      await writeAtomic(target, (tmpPath) => writeFile(tmpPath, data));
      return describe(normalized, target);
    },

    async putFile(key, sourcePath) {
      const { key: normalized, target } = targetOf(key);
      await writeAtomic(target, (tmpPath) => copyFile(sourcePath, tmpPath));
      return describe(normalized, target);
    },

    async get(key) {
      try {
        return await readFile(targetOf(key).target);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async exists(key) {
      return existsAt(targetOf(key).target);
    },

    async remove(key) {
      const { target } = targetOf(key);
      if (!(await existsAt(target))) return false;
      await rm(target);
      return true;
    },

    async list(prefix) {
      const wanted = prefix ? normalizeStorageKey(prefix) : '';
      const keys = await collectKeys(root);
      return keys.filter((key) => (wanted ? key === wanted || key.startsWith(`${wanted}/`) : true)).sort();
    },
  };
}

export function createStorage(config: AppConfig): Storage {
  switch (config.STORAGE_DRIVER) {
    case 'local':
      return createLocalStorage(config.STORAGE_DIR);
    default:
      throw new Error(`storage driver chưa hỗ trợ: ${String(config.STORAGE_DRIVER)}`);
  }
}
