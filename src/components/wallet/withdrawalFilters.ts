/** Filter-shape key for withdrawal filters (F10, FRICTION-ANALYSIS-2026-09-18).
 *
 *  A selection that survives a filter change is invisible money danger: the
 *  user can bulk-act on rows they can no longer see. Callers derive a key from
 *  their filter state and clear the selection whenever the key changes.
 */
export function buildWithdrawalFilterKey(filters: {
  search?: string;
  statusFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: string;
  amountMax?: string;
  tab?: string;
}): string {
  return [
    filters.search ?? '',
    filters.statusFilter ?? '',
    filters.dateFrom ?? '',
    filters.dateTo ?? '',
    filters.amountMin ?? '',
    filters.amountMax ?? '',
    filters.tab ?? '',
  ].join('|');
}
