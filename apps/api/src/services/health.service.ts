import { pingDb, type DbHandle } from '@affilio/core';

/**
 * Tầng nghiệp vụ của healthcheck. Chỉ báo DB có trả lời hay không, không ném lỗi:
 * controller cần biết để trả 503 và log nguyên nhân.
 */

export interface ReadinessCheck {
  ready: boolean;
  /** Lỗi gốc khi DB chưa sẵn sàng, để controller log. */
  error?: unknown;
}

export async function checkReadiness(handle: DbHandle): Promise<ReadinessCheck> {
  try {
    await pingDb(handle);
    return { ready: true };
  } catch (error) {
    return { ready: false, error };
  }
}
