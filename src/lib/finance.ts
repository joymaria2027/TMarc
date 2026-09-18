/** Shared finance helpers: dense tabular money, pagination, inline validation. */

export function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'D0.00';
  return `D${n.toFixed(2)}`;
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safe - 1) * pageSize;
  const paged = items.slice(startIdx, startIdx + pageSize);
  return {
    paged,
    totalPages,
    page: safe,
    start: items.length === 0 ? 0 : startIdx + 1,
    end: Math.min(startIdx + pageSize, items.length),
    total: items.length,
  };
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay = 500) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export function validateSharing(input: { merchant_id: string; r: number; m: number; p: number; u: number }): string | null {
  if (!input.merchant_id) return 'Select a merchant.';
  for (const [k, v] of [['Rider', input.r], ['Merchant', input.m], ['Platform', input.p], ['UCS Rides', input.u]] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 100) return `${k} % must be between 0 and 100.`;
  }
  if (Math.abs(input.r + input.m + input.p + input.u - 100) > 0.01) return 'Percentages must add up to 100%.';
  return null;
}

export function validateWithdrawal(amountRaw: string, balance: number): string | null {
  const n = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(n) || n <= 0) return 'Enter an amount greater than 0.';
  if (n > balance) return 'Amount exceeds wallet balance.';
  return null;
}

export function validateServiceArea(input: { name: string; lat: string; lng: string; radius: string }): string | null {
  if (!input.name.trim()) return 'Service area name is required.';
  if (!Number.isFinite(parseFloat(input.lat))) return 'Center latitude must be a number.';
  if (!Number.isFinite(parseFloat(input.lng))) return 'Center longitude must be a number.';
  const r = parseFloat(input.radius);
  if (!Number.isFinite(r) || r <= 0) return 'Radius must be greater than 0 km.';
  return null;
}

export function entityIdOf(_check: string, row: Record<string, unknown>): string {
  const r = row as Record<string, unknown>;
  return String(
    r.id ?? r.delivery_id ?? r.tx_id ?? r.withdrawal_id ?? r.wallet_id ?? r.expense_id ?? r.rider_expense_id ?? r.reference ?? ''
  );
}

/** Token-mapped chart palette (dark-contrast safe via CSS vars). */
export const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--accent))',
  'hsl(var(--destructive))',
];
