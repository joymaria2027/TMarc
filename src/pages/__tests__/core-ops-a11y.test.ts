import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

// Pure helpers under test (mirrors implementations wired into pages).
export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const safe = Math.max(0, page);
  return rows.slice(safe * pageSize, safe * pageSize + pageSize);
}
export function telHref(phone: string | null | undefined): string | null {
  const v = (phone || '').trim();
  if (!v || v === '—' || v === '-') return null;
  return `tel:${v.replace(/[^+\d]/g, '') || v}`;
}
// Canonical verbs per PRODUCT.md: Merchant (not Restaurant), Unassigned (not Unattended),
// Claim = unassigned pool, Accept = dispatched offer.
export function queueVerb(status: string, hasRider: boolean): 'Claim' | 'Accept' | null {
  if (status === 'unassigned' && !hasRider) return 'Claim';
  if (status === 'dispatched') return 'Accept';
  return null;
}

describe('core-ops helpers', () => {
  it('paginate slices deterministically', () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(paginate(rows, 0, 20)).toHaveLength(20);
    expect(paginate(rows, 1, 20)).toHaveLength(20);
    expect(paginate(rows, 2, 20)).toHaveLength(5);
    expect(paginate(rows, 0, 20)[0]).toBe(0);
    expect(paginate(rows, 1, 20)[0]).toBe(20);
  });
  it('telHref guards empty/placeholder phones', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref('—')).toBeNull();
    expect(telHref(' +123 456 ')).toBe('tel:+123456');
  });
  it('queueVerb unifies Claim/Accept', () => {
    expect(queueVerb('unassigned', false)).toBe('Claim');
    expect(queueVerb('dispatched', true)).toBe('Accept');
    expect(queueVerb('delivered', false)).toBeNull();
  });
});

describe('P0 keyboard/safety (core ops)', () => {
  it('DeliveriesPage unattended cards are keyboard-operable (real button + aria-label)', () => {
    const s = read('src/pages/DeliveriesPage.tsx');
    // No bare Card onClick without keyboard support
    expect(s).not.toMatch(/<Card[^>]*onClick/);
    expect(s).toMatch(/aria-label={?[`'"]?View delivery/);
  });
  it('GpsTrackerPage rider cards are keyboard-operable', () => {
    const s = read('src/pages/GpsTrackerPage.tsx');
    expect(s).not.toMatch(/<Card[^>]*onClick/);
    expect(s).toMatch(/aria-label={?[`'"]?Track rider/);
  });
  it('RiderDashboard offer cards are keyboard-operable', () => {
    const s = read('src/pages/RiderDashboard.tsx');
    expect(s).not.toMatch(/<Card[^>]*onClick=\{\(\) => openDetail/);
    // OfferCard extracted to src/components/rider/OfferCard.tsx (page imports it)
    const offer = read('src/components/rider/OfferCard.tsx');
    expect(offer).toMatch(/aria-label={?[`'"]?View offer/);
    expect(offer).not.toMatch(/<Card[^>]*onClick/);
    expect(s).toMatch(/OfferCard|QueueCard/);
  });
  it('DispatchAuditPage headers are buttons with aria-expanded', () => {
    const s = read('src/pages/DispatchAuditPage.tsx');
    expect(s).not.toMatch(/<CardHeader[^>]*onClick/);
    expect(s).toMatch(/aria-expanded/);
  });
  it('RiderDashboard has no window.prompt (themed Dialog instead)', () => {
    const s = read('src/pages/RiderDashboard.tsx');
    expect(s).not.toContain('window.prompt');
    expect(s).toMatch(/CancelAcceptance|pendingCancel/);
  });
  it('RiderExpensesPage receipt affordance is a Button, not Badge onClick', () => {
    const s = read('src/pages/RiderExpensesPage.tsx');
    expect(s).not.toMatch(/<Badge[^>]*onClick/);
    // ExpenseRow extracted to src/components/expenses/ExpenseRow.tsx (receipt as Button)
    const row = read('src/components/expenses/ExpenseRow.tsx');
    expect(row).not.toMatch(/<Badge[^>]*onClick/);
    expect(row).toMatch(/View receipt|Open receipt/);
    expect(row).toMatch(/<Button[^>]*aria-label=\{?[`'"]?View receipt/);
    expect(s).toMatch(/ExpenseRow|ExpenseFormDialog/);
  });
});

describe('P1 forms/theming/perf (core ops)', () => {
  it('no hard-coded green status colors (token-only)', () => {
    for (const f of [
      'src/pages/DeliveriesPage.tsx',
      'src/pages/RejectedDeliveriesPage.tsx',
      'src/pages/DispatchAuditPage.tsx',
      'src/pages/GpsTrackerPage.tsx',
      'src/pages/RidersPage.tsx',
      'src/pages/RiderDashboard.tsx',
      'src/pages/RiderExpensesPage.tsx',
      'src/components/Layout.tsx',
    ]) {
      const s = read(f);
      expect(`${f}: ${s.match(/bg-green-\d|text-green-\d/g)?.join(',') || ''}`).not.toMatch(/bg-green-\d|text-green-\d/);
    }
  });
  it('search inputs have programmatic labels (sr-only + htmlFor/id)', () => {
    for (const f of [
      'src/pages/DeliveriesPage.tsx',
      'src/pages/RejectedDeliveriesPage.tsx',
      'src/pages/DispatchAuditPage.tsx',
      'src/pages/RidersPage.tsx',
    ]) {
      const s = read(f);
      expect(s).toContain('sr-only');
      expect(s).toMatch(/htmlFor="/);
    }
  });
  it('RidersPage + RiderExpensesPage Labels are associated via htmlFor/id', () => {
    for (const f of ['src/pages/RidersPage.tsx', 'src/pages/RiderExpensesPage.tsx']) {
      const s = read(f);
      // every <Label> without htmlFor fails — Labels must all carry htmlFor
      const labels = [...s.matchAll(/<Label(?![^>]*htmlFor)[^>]*>/g)].map((m) => m[0]);
      expect(`${f} unassociated Labels: ${labels.join(' | ')}`).not.toMatch(/<Label(?![^>]*htmlFor)/);
    }
  });
  it('icon-only buttons carry aria-labels', () => {
    for (const f of [
      'src/pages/DeliveriesPage.tsx',
      'src/pages/RiderExpensesPage.tsx',
      'src/components/Layout.tsx',
    ]) {
      const s = read(f);
      const iconButtons = [...s.matchAll(/<Button[^>]*size="icon"[^>]*>/g)].map((m) => m[0]);
      const unlabeled = iconButtons.filter((b) => !/aria-label=/.test(b));
      expect(unlabeled).toEqual([]);
    }
  });
  it('no 10px badge text (bumped to 12px min)', () => {
    for (const f of [
      'src/pages/RejectedDeliveriesPage.tsx',
      'src/pages/RiderExpensesPage.tsx',
      'src/components/Layout.tsx',
    ]) {
      expect(read(f)).not.toContain('text-[10px]');
    }
  });
  it('lists are paginated (no unbounded map over 200-1000 rows)', () => {
    for (const f of [
      'src/pages/DeliveriesPage.tsx',
      'src/pages/RejectedDeliveriesPage.tsx',
      'src/pages/DispatchAuditPage.tsx',
      'src/pages/RidersPage.tsx',
    ]) {
      const s = read(f);
      expect(s).toMatch(/paginate|PAGE_SIZE|pageSize|Show more|Load more|Pagination/);
    }
  });
  it('realtime handlers patch state (no full load() on every event)', () => {
    const d = read('src/pages/DeliveriesPage.tsx');
    expect(d).toMatch(/setDeliveries\(prev => prev\.map/);
    const r = read('src/pages/RejectedDeliveriesPage.tsx');
    // patched or debounced reload — must not call load() synchronously on every event
    expect(r).toMatch(/debounce|setRows\(prev|patch/);
  });
  it('DeliveryMap colors come from CSS vars (no hard-coded hex)', () => {
    const s = read('src/components/DeliveryMap.tsx');
    expect(s).not.toMatch(/#22c55e|#ef4444|#3b82f6/);
    expect(s).toMatch(/getComputedStyle|var\(--/);
  });
});

describe('P2 polish (core ops)', () => {
  it('no border-l-2 side stripes in Rejected/Expenses', () => {
    expect(read('src/pages/RejectedDeliveriesPage.tsx')).not.toContain('border-l-2');
    expect(read('src/components/Layout.tsx')).not.toContain('border-l-2');
    const e = read('src/pages/RiderExpensesPage.tsx');
    // consumption disclosure must not use accent side-stripe
    expect(e).not.toMatch(/border-l-2 border-muted/);
  });
  it('dialog grids stack on mobile', () => {
    for (const f of [
      'src/pages/DeliveriesPage.tsx',
      'src/pages/RejectedDeliveriesPage.tsx',
      'src/pages/RiderDashboard.tsx',
      'src/pages/RiderExpensesPage.tsx',
    ]) {
      const s = read(f);
      if (/grid grid-cols-2/.test(s)) {
        expect(s).toMatch(/grid-cols-1 sm:grid-cols-2/);
      }
    }
  });
  it('Layout sidebar: skip link + aria-current + Escape to close', () => {
    const s = read('src/components/Layout.tsx');
    expect(s).toMatch(/Skip to content|skip/i);
    expect(s).toMatch(/aria-current/);
    expect(s).toMatch(/Escape/);
  });
  it('DeliveryMap exposes region role; LiveDeliveryMap has taught empty', () => {
    expect(read('src/components/DeliveryMap.tsx')).toMatch(/role="region"/);
    const live = read('src/components/LiveDeliveryMap.tsx');
    expect(live).toMatch(/role="status"|No live location|waiting for the rider/);
  });
  it('tel: links are guarded (no tel: with empty/placeholder)', () => {
    for (const f of ['src/pages/RejectedDeliveriesPage.tsx', 'src/pages/RiderDashboard.tsx', 'src/pages/RiderExpensesPage.tsx']) {
      const s = read(f);
      // every href={`tel:...`} must be behind a truthy phone check or telHref guard
      expect(s).not.toMatch(/href=\{`tel:\$\{d\.customer_phone\}`\}/);
    }
  });
  it('loading states use .shimmer skeletons with role=status (no bare spinners)', () => {
    for (const f of [
      'src/pages/DeliveriesPage.tsx',
      'src/pages/GpsTrackerPage.tsx',
      'src/pages/RidersPage.tsx',
      'src/pages/RiderExpensesPage.tsx',
    ]) {
      const s = read(f);
      expect(s).toMatch(/shimmer|Skeleton/);
      expect(s).toMatch(/role="status"/);
    }
  });
  it('verbs are unified (no Unattended label, no Restaurant, no Take over)', () => {
    const rej = read('src/pages/RejectedDeliveriesPage.tsx');
    expect(rej).not.toMatch(/Unattended/);
    expect(rej).not.toMatch(/Take over/);
    expect(rej).not.toMatch(/Restaurant/);
    const del = read('src/pages/DeliveriesPage.tsx');
    expect(del).not.toMatch(/Take over/);
  });
});
