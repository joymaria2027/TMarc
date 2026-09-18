/** Pure guards for money actions: payroll runs, settlement payouts, withdrawals. */

/** Validate a payroll run period. Returns an inline error message or null. */
export function validateRunPeriod(periodStart: string, periodEnd: string): string | null {
  if (!periodStart || !periodEnd) return 'Pick a start and end date.';
  if (periodStart > periodEnd) return 'Period start must be before period end.';
  return null;
}

export interface PayoutDelivery {
  id: string;
  settlement_approved: boolean;
  sharing: unknown;
}

/**
 * Split a rider's deliveries for bulk payout: only unapproved deliveries WITH
 * a sharing ratio can be approved. Unapproved deliveries WITHOUT a ratio are
 * reported (not silently skipped) so the toast stays honest about money.
 */
export function partitionPayoutDeliveries<T extends PayoutDelivery>(
  deliveries: T[]
): { approvable: T[]; skippedNoRatio: T[] } {
  const approvable: T[] = [];
  const skippedNoRatio: T[] = [];
  for (const d of deliveries) {
    if (d.settlement_approved) continue;
    if (d.sharing) approvable.push(d);
    else skippedNoRatio.push(d);
  }
  return { approvable, skippedNoRatio };
}

export interface BulkWriteResult {
  id: string;
  error: { message?: string } | null;
}

export interface BulkSummary {
  succeeded: number;
  failed: number;
  failedIds: string[];
}

/**
 * Summarize a bulk money write (F1, FRICTION-ANALYSIS-2026-09-18). Sequential
 * per-row loops can half-succeed; the UI must say exactly which rows landed
 * and which did not instead of a bare per-id error toast (or worse, a
 * catch-all that over-claims reversal).
 */
export function summarizeBulkResult(results: BulkWriteResult[]): BulkSummary {
  const failedIds: string[] = [];
  let succeeded = 0;
  for (const r of results) {
    if (r.error) failedIds.push(r.id);
    else succeeded++;
  }
  return { succeeded, failed: failedIds.length, failedIds };
}

/** Toast copy for a bulk result: honest about partial failure, names ids. */
export function bulkResultMessage(summary: BulkSummary, action: string): string {
  if (summary.failed === 0) {
    return `${summary.succeeded} ${summary.succeeded === 1 ? 'entry' : 'entries'} ${action}`;
  }
  const ids = summary.failedIds.map(id => `#${id.slice(0, 8)}`).join(', ');
  return `${summary.succeeded} ${summary.succeeded === 1 ? 'entry' : 'entries'} ${action}; ${summary.failed} failed (${ids}) — retry the failed rows`;
}
