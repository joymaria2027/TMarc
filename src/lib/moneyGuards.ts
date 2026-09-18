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
