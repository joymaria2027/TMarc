import { describe, it, expect } from 'vitest';
import {
  money,
  formatDateTime,
  formatDateOnly,
  getBackfillPreview,
  getBackfillTotal,
  buildBackfillConfirmSummary,
  getStatusToken,
  getOutcomeToken,
  type BackfillRow,
} from '../paymentBackfill.helpers';

const rows = [
  { order_id: '1', status: 'missing', expected_credit: 100 } as BackfillRow,
  { order_id: '2', status: 'credited', expected_credit: 50 } as BackfillRow,
  { order_id: '3', status: 'mismatch', expected_credit: 25 } as BackfillRow,
  { order_id: '4', status: 'missing', expected_credit: 200 } as BackfillRow,
] as BackfillRow[];

describe('paymentBackfill.helpers', () => {
  it('money formats Dalasi with 2 decimals', () => {
    expect(money(100)).toBe('D 100.00');
    expect(money(null)).toBe('D 0.00');
  });

  it('formatDateTime uses consistent date-fns format (no toLocaleString)', () => {
    const out = formatDateTime('2026-01-05T14:30:00.000Z');
    expect(out).toMatch(/Jan 5, 2026/);
    expect(out).toContain(':');
    expect(formatDateTime(null)).toBe('—');
  });

  it('formatDateOnly uses date-fns', () => {
    expect(formatDateOnly('2026-01-05T00:00:00.000Z')).toMatch(/Jan 5, 2026/);
    expect(formatDateOnly(null)).toBe('start');
  });

  it('getBackfillPreview filters missing only', () => {
    expect(getBackfillPreview(rows).map((r) => r.order_id)).toEqual(['1', '4']);
  });

  it('getBackfillTotal sums expected_credit', () => {
    expect(getBackfillTotal(getBackfillPreview(rows))).toBe(300);
  });

  it('buildBackfillConfirmSummary includes count + total + range', () => {
    const msg = buildBackfillConfirmSummary(2, 300, '2026-01-01', '2026-01-31');
    expect(msg).toContain('2');
    expect(msg).toContain('D 300.00');
    expect(msg).toContain('2026-01-01');
    expect(msg).toContain('2026-01-31');
  });

  it('status tokens use design tokens (no emerald/amber hardcodes)', () => {
    const credited = getStatusToken('credited');
    const missing = getStatusToken('missing');
    const mismatch = getStatusToken('mismatch');
    expect(credited).toContain('bg-success');
    expect(missing).toContain('bg-destructive');
    expect(mismatch).toContain('bg-warning');
    for (const t of [credited, missing, mismatch]) {
      expect(t).not.toContain('emerald');
      expect(t).not.toContain('amber-500');
    }
  });

  it('outcome tokens use design tokens', () => {
    expect(getOutcomeToken('credited')).toContain('bg-success');
    expect(getOutcomeToken('skipped')).toContain('bg-secondary');
    expect(getOutcomeToken('failed')).toContain('bg-destructive');
  });
});
