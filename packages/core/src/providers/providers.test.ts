import { describe, expect, it } from 'vitest';
import { nextUtcMidnight, utcDay } from '#src/providers/index.ts';

describe('mốc hạn mức theo ngày UTC', () => {
  it('nextUtcMidnight là 00:00 UTC hôm sau', () => {
    expect(nextUtcMidnight(new Date('2026-03-31T23:59:00Z')).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('utcDay lấy ngày theo UTC', () => {
    expect(utcDay(new Date('2026-03-31T23:59:00Z'))).toBe('2026-03-31');
  });
});
