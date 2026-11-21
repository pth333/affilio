import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalStorage, normalizeStorageKey, type Storage } from '#src/storage/index.ts';

const created: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vm-storage-'));
  created.push(dir);
  return dir;
}

async function freshStorage(): Promise<Storage> {
  return createLocalStorage(await tempDir());
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const sha256 = (data: string): string => createHash('sha256').update(data).digest('hex');

describe('normalizeStorageKey', () => {
  it('bỏ dấu / thừa và đổi \\ thành /', () => {
    expect(normalizeStorageKey('/video/a.mp4/')).toBe('video/a.mp4');
    expect(normalizeStorageKey('video\\a.mp4')).toBe('video/a.mp4');
  });

  it('chặn khóa thoát ra ngoài thư mục gốc hoặc có ký tự lạ', () => {
    expect(() => normalizeStorageKey('')).toThrow();
    expect(() => normalizeStorageKey('../etc/passwd')).toThrow();
    expect(() => normalizeStorageKey('a/../../b')).toThrow();
    expect(() => normalizeStorageKey('a/./b')).toThrow();
    expect(() => normalizeStorageKey('a b.mp4')).toThrow();
  });
});

describe('storage cục bộ', () => {
  it('ghi rồi đọc lại, kèm size và sha256', async () => {
    const storage = await freshStorage();
    const stored = await storage.put('render/v1/final.mp4', 'xin chào');

    expect(stored.key).toBe('render/v1/final.mp4');
    expect(stored.size).toBe(Buffer.byteLength('xin chào'));
    expect(stored.sha256).toBe(sha256('xin chào'));
    expect((await storage.get('render/v1/final.mp4'))?.toString('utf8')).toBe('xin chào');
    expect(await storage.exists('render/v1/final.mp4')).toBe(true);
    expect(storage.path('render/v1/final.mp4')).toBe(join(storage.root, 'render', 'v1', 'final.mp4'));
  });

  it('khóa chưa có thì get trả null, exists false, remove false', async () => {
    const storage = await freshStorage();
    expect(await storage.get('chua/co.mp4')).toBeNull();
    expect(await storage.exists('chua/co.mp4')).toBe(false);
    expect(await storage.remove('chua/co.mp4')).toBe(false);
  });

  it('xoá được tệp đã ghi', async () => {
    const storage = await freshStorage();
    await storage.put('a.mp4', 'x');

    expect(await storage.remove('a.mp4')).toBe(true);
    expect(await storage.exists('a.mp4')).toBe(false);
  });

  it('putFile đưa tệp có sẵn trên đĩa vào storage', async () => {
    const storage = await freshStorage();
    const source = join(await tempDir(), 'ffmpeg-out.mp4');
    await writeFile(source, 'video bytes');

    const stored = await storage.putFile('render/v2/final.mp4', source);
    expect(stored.sha256).toBe(sha256('video bytes'));
    expect((await storage.get('render/v2/final.mp4'))?.toString('utf8')).toBe('video bytes');
  });

  it('list trả khóa đã sắp xếp và lọc theo tiền tố', async () => {
    const storage = await freshStorage();
    await storage.put('video/b.mp4', 'b');
    await storage.put('video/a.mp4', 'a');
    await storage.put('asset/c.png', 'c');

    expect(await storage.list()).toEqual(['asset/c.png', 'video/a.mp4', 'video/b.mp4']);
    expect(await storage.list('video')).toEqual(['video/a.mp4', 'video/b.mp4']);
    expect(await storage.list('asset')).toEqual(['asset/c.png']);
    expect(await storage.list('khong-co')).toEqual([]);
  });
});
