/** Pure triage helpers for the ops alerts queue (AlertsPage). */

export type AlertGroup = 'all' | 'delivery' | 'money' | 'system';
export type AlertSeverity = 'critical' | 'info' | 'success';

const GROUP_OF: Record<string, Exclude<AlertGroup, 'all'>> = {
  late_delivery: 'delivery',
  route_deviation: 'delivery',
  out_of_area: 'delivery',
  delivery_completed: 'delivery',
  withdrawal_request: 'money',
  withdrawal_completed: 'money',
  withdrawal_rejected: 'money',
  wallet_credit: 'money',
  wallet_credit_corrected: 'money',
  suspicious: 'system',
  duplicate: 'system',
};

const CRITICAL = new Set([
  'late_delivery',
  'route_deviation',
  'suspicious',
  'out_of_area',
  'withdrawal_request',
  'withdrawal_rejected',
]);

const SUCCESS = new Set(['delivery_completed', 'withdrawal_completed', 'wallet_credit']);

const LABELS: Record<string, string> = {
  late_delivery: 'Late delivery',
  route_deviation: 'Route deviation',
  suspicious: 'Suspicious activity',
  duplicate: 'Possible duplicate',
  out_of_area: 'Out of service area',
  delivery_completed: 'Delivery completed',
  withdrawal_request: 'Withdrawal requested',
  withdrawal_completed: 'Withdrawal completed',
  withdrawal_rejected: 'Withdrawal rejected',
  wallet_credit: 'Wallet credited',
  wallet_credit_corrected: 'Wallet credit corrected',
};

/** Group for filtering. Unknown types return null and are never hidden by a group filter. */
export function alertGroup(type: string): Exclude<AlertGroup, 'all'> | null {
  return GROUP_OF[type] ?? null;
}

export function alertSeverity(type: string): AlertSeverity {
  if (CRITICAL.has(type)) return 'critical';
  if (SUCCESS.has(type)) return 'success';
  return 'info';
}

/** Human-readable label; unknown types fall back to title-cased words. */
export function humanizeAlertType(type: string): string {
  const known = LABELS[type];
  if (known) return known;
  const words = type.replace(/_/g, ' ').trim();
  return words.length > 0 ? words[0].toUpperCase() + words.slice(1) : type;
}

export interface FilterableAlert {
  alert_type: string;
  message: string;
}

export function filterAlerts<T extends FilterableAlert>(
  alerts: T[],
  opts: { group: AlertGroup; query: string }
): T[] {
  const q = opts.query.trim().toLowerCase();
  return alerts.filter((a) => {
    if (opts.group !== 'all') {
      const g = alertGroup(a.alert_type);
      if (g !== null && g !== opts.group) return false;
    }
    if (!q) return true;
    return (
      a.message.toLowerCase().includes(q) ||
      humanizeAlertType(a.alert_type).toLowerCase().includes(q)
    );
  });
}

export type StatusFilter = 'all' | 'unresolved' | 'resolved';

export interface AlertRow {
  id: string;
  is_resolved: boolean;
}

function matchesStatus<T extends AlertRow>(row: T, status: StatusFilter): boolean {
  if (status === 'unresolved') return !row.is_resolved;
  if (status === 'resolved') return row.is_resolved;
  return true;
}

export type AlertEvent<T extends AlertRow> =
  | { kind: 'INSERT'; row: T }
  | { kind: 'UPDATE'; row: T }
  | { kind: 'DELETE'; id: string };

/**
 * Realtime patch for the alerts list (filter-aware): keeps scroll position by
 * avoiding full reloads. INSERT prepends when visible under the status filter,
 * UPDATE merges and evicts rows that no longer match, DELETE removes.
 */
export function patchAlerts<T extends AlertRow>(
  prev: T[],
  event: AlertEvent<T>,
  status: StatusFilter
): T[] {
  if (event.kind === 'DELETE') return prev.filter((a) => a.id !== event.id);
  if (event.kind === 'INSERT') {
    if (!matchesStatus(event.row, status)) return prev;
    if (prev.some((a) => a.id === event.row.id)) {
      return prev.map((a) => (a.id === event.row.id ? event.row : a));
    }
    return [event.row, ...prev];
  }
  const merged = prev.map((a) => (a.id === event.row.id ? { ...a, ...event.row } : a));
  const exists = prev.some((a) => a.id === event.row.id);
  const next = exists ? merged : matchesStatus(event.row, status) ? [event.row, ...prev] : prev;
  return next.filter((a) => matchesStatus(a, status));
}
