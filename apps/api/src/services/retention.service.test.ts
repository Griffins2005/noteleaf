import { describe, expect, it } from 'vitest';
import { expiredSessionWhere, retentionCutoff } from './retention.service.js';

describe('retentionCutoff', () => {
  it('subtracts whole days from now', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    expect(retentionCutoff(7, now).toISOString()).toBe('2026-08-26T12:00:00.000Z');
    expect(retentionCutoff(30, now).toISOString()).toBe('2026-08-03T12:00:00.000Z');
    expect(retentionCutoff(90, now).toISOString()).toBe('2026-06-04T12:00:00.000Z');
  });
});

describe('expiredSessionWhere', () => {
  it('scopes to the user, ages by updatedAt, and keeps in-progress recordings', () => {
    const now = new Date('2026-09-02T12:00:00.000Z');
    expect(expiredSessionWhere('user-1', 30, now)).toEqual({
      userUuid: 'user-1',
      updatedAt: { lt: new Date('2026-08-03T12:00:00.000Z') },
      status: { not: 'RECORDING' },
    });
  });
});
