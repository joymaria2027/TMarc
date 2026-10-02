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

export type WithdrawalBulkAction = 'approve' | 'reject';

/**
 * Statuses a manager's bulk action may legally move, per action.
 *
 * `approve` only ever acts on `pending`. Critically it does NOT include
 * `manager_approved`: rewinding an already-approved row to the same value looks
 * like a no-op in the UI, but it discards the accountant's turn, and if the row
 * had reached `completed` it lets `process_withdrawal_completion` run the wallet
 * debit a SECOND time. `completed` is the row that must never be rewound.
 *
 * This set is the shared source for the allowed statuses: the page uses it for
 * the client-side partition AND for the `.in('status', …)` predicate, so the two
 * cannot disagree about which values are allowed. Each site still applies its
 * own predicate to it, so extending this set is a deliberate act — a status with
 * no rule is silently skipped, which is the safe default.
 */
export const WITHDRAWAL_BULK_ALLOWED_STATUSES: Record<WithdrawalBulkAction, readonly string[]> = {
  approve: ['pending'],
  reject: ['pending', 'manager_approved'],
};

export interface WithdrawalRequest {
  id: string;
  status: string;
}

/**
 * Split a manager's bulk withdrawal selection by whether the row is still in a
 * state this action can legally move. Skipped rows are reported, not silently
 * dropped, so the toast can say which rows did not land.
 */
export function partitionWithdrawableRequests<T extends WithdrawalRequest>(
  requests: T[],
  action: WithdrawalBulkAction,
): { actionable: T[]; skippedWrongState: T[] } {
  const allowed = WITHDRAWAL_BULK_ALLOWED_STATUSES[action];
  const actionable: T[] = [];
  const skippedWrongState: T[] = [];
  for (const r of requests) {
    if (allowed.includes(r.status)) actionable.push(r);
    else skippedWrongState.push(r);
  }
  return { actionable, skippedWrongState };
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

/** Expense confidence bands (dual-mode settlement, ticket issue 02).
 *  A (>=85): auto-verify eligible (amount <= cap, daily budget left).
 *  B (60-84): human queue, one-click verify allowed.
 *  C (<60, unscored legacy rows count as B): human queue, reason required.
 */
export const CONFIDENCE_AUTO_SCORE = 85;
export const CONFIDENCE_AUTO_AMOUNT_CAP = 100;
export const CONFIDENCE_AUTO_DAILY_CAP = 300;
export const CONFIDENCE_REVIEW_BELOW = 60;

export type ConfidenceBand = 'A' | 'B' | 'C';

export function confidenceBand(score: number | null | undefined): ConfidenceBand {
  if (typeof score !== 'number') return 'B';
  if (score >= CONFIDENCE_AUTO_SCORE) return 'A';
  if (score >= CONFIDENCE_REVIEW_BELOW) return 'B';
  return 'C';
}

/** C-band expenses cannot be one-click verified — a reason is required. */
export function requiresReviewReason(score: number | null | undefined): boolean {
  return confidenceBand(score) === 'C';
}
