import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/{api,worker,cli}/src/**/*.test.ts'],
    environment: 'node',
    // Test tích hợp DB dùng schema riêng nên chạy tuần tự từng file cho chắc.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
