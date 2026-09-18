import { format } from 'date-fns';

export interface BackfillRow {
  order_id: string;
  order_reference?: string | null;
  expected_credit: number;
  status: 'credited' | 'missing' | 'mismatch';
  [k: string]: unknown;
}

export const money = (n: number | null | undefined): string => `D ${Number(n ?? 0).toFixed(2)}`;

export function formatDateTime(s: string | null): string {
  if (!s) return '—';
  try {
    return format(new Date(s), 'MMM d, yyyy HH:mm');
  } catch {
    return '—';
  }
}

export function formatDateOnly(s: string | null): string {
  if (!s) return 'start';
  try {
    return format(new Date(s), 'MMM d, yyyy');
  } catch {
    return 'start';
  }
}

export function formatRangeEnd(s: string | null): string {
  if (!s) return 'now';
  try {
    return format(new Date(s), 'MMM d, yyyy');
  } catch {
    return 'now';
  }
}

export function getBackfillPreview(rows: BackfillRow[]): BackfillRow[] {
  return rows.filter((r) => r.status === 'missing');
}

export function getBackfillTotal(preview: Pick<BackfillRow, 'expected_credit'>[]): number {
  return preview.reduce((s, r) => s + Number(r.expected_credit ?? 0), 0);
}

export function buildBackfillConfirmSummary(
  count: number,
  total: number,
  from: string,
  to: string,
): string {
  const range = `${from || 'start'} → ${to || 'now'}`;
  return `Credit ${count} order(s) totalling ${money(total)} to merchant wallets? Range: ${range}. This action is reversible only via manual adjustment.`;
}

export function getStatusToken(status: BackfillRow['status']): string {
  if (status === 'credited') return 'bg-success text-success-foreground border-transparent';
  if (status === 'missing') return 'bg-destructive text-destructive-foreground border-transparent';
  return 'bg-warning text-warning-foreground border-transparent';
}

export function getOutcomeToken(outcome: string): string {
  if (outcome === 'credited') return 'bg-success text-success-foreground border-transparent';
  if (outcome === 'skipped') return 'bg-secondary text-secondary-foreground border-transparent';
  return 'bg-destructive text-destructive-foreground border-transparent';
}

export function escapeCsvCell(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}
