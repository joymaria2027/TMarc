import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  formatMoney,
  paginate,
  validateSharing,
  validateWithdrawal,
  validateServiceArea,
  entityIdOf,
} from '@/lib/finance';
import { summarizeBulkResult } from '@/lib/moneyGuards';
import { buildWithdrawalFilterKey } from '@/components/wallet/withdrawalFilters';

const srcDir = path.resolve(__dirname, '..');
const compDir = path.resolve(__dirname, '../../components');
const read = (p: string) => fs.readFileSync(p, 'utf8');
const GROUP = [
  'SettlementsPage.tsx',
  'RevenueSharingPage.tsx',
  'WalletPage.tsx',
  'PayrollPage.tsx',
  'ReconciliationPage.tsx',
  'ExpenseTypesPage.tsx',
  'AnalyticsPage.tsx',
  'FraudPage.tsx',
].map((f) => read(path.join(srcDir, f)));
const widgetSrc = read(path.join(compDir, 'WalletWidget.tsx'));
const byName = (n: string) => read(path.join(srcDir, n));
const allGroupSrc = [...GROUP, widgetSrc].join('\n');

// TDD callers-first: pure helper contracts used by the finance group.
describe('formatMoney (P2: standardize D + toFixed(2))', () => {
  it('formats zero and rounding', () => {
    expect(formatMoney(0)).toBe('D0.00');
    expect(formatMoney(1234.5)).toBe('D1234.50');
    expect(formatMoney('10')).toBe('D10.00');
  });
  it('handles NaN safely', () => {
    expect(formatMoney(NaN)).toBe('D0.00');
  });
});

describe('paginate helper (P1: paginate/virtualize)', () => {
  it('slices and reports range', () => {
    const items = [1, 2, 3, 4, 5];
    const r = paginate(items, 2, 2);
    expect(r.paged).toEqual([3, 4]);
    expect(r.totalPages).toBe(3);
    expect(r.start).toBe(3);
    expect(r.end).toBe(4);
  });
});

describe('validateSharing (P1: inline errors, not toast-only)', () => {
  it('requires merchant', () => {
    expect(validateSharing({ merchant_id: '', r: 50, m: 20, p: 15, u: 15 })).toMatch(/merchant/i);
  });
  it('requires sum 100', () => {
    expect(validateSharing({ merchant_id: 'x', r: 50, m: 20, p: 15, u: 10 })).toMatch(/100/);
  });
  it('accepts valid split', () => {
    expect(validateSharing({ merchant_id: 'x', r: 50, m: 20, p: 15, u: 15 })).toBeNull();
  });
});

describe('validateWithdrawal', () => {
  it('rejects non-positive and over-balance', () => {
    expect(validateWithdrawal('', 100)).toMatch(/amount/i);
    expect(validateWithdrawal('200', 100)).toMatch(/exceed/i);
    expect(validateWithdrawal('50', 100)).toBeNull();
  });
});

describe('validateServiceArea', () => {
  it('requires name + numeric lat/lng/radius', () => {
    expect(validateServiceArea({ name: '', lat: '1', lng: '1', radius: '20' })).toMatch(/name/i);
    expect(validateServiceArea({ name: 'A', lat: 'bad', lng: '1', radius: '20' })).toMatch(/lat/i);
    expect(validateServiceArea({ name: 'A', lat: '1', lng: '1', radius: '20' })).toBeNull();
  });
});

describe('entityIdOf (P1: tabular audit rows)', () => {
  it('picks first available id field', () => {
    expect(entityIdOf('k', { id: 'a' })).toBe('a');
    expect(entityIdOf('k', { delivery_id: 'd1' })).toBe('d1');
    expect(entityIdOf('k', {})).toBe('');
  });
});

// Static audit guards for the finance group (P0/P1 token + a11y contracts).
describe('finance group audit guards', () => {
  it('P0: RevenueSharing has no div onClick card-as-button', () => {
    expect(byName('RevenueSharingPage.tsx')).not.toMatch(/<div[^>]*onClick/);
  });
  it('P1: no emerald/green/amber-500/blue-500 status colors in group', () => {
    expect(allGroupSrc).not.toMatch(/emerald|text-green-|bg-green-|amber-500|blue-500/);
  });
  it('P1: no raw chart HSL in Analytics (use success/warning/info/primary tokens)', () => {
    expect(byName('AnalyticsPage.tsx')).not.toMatch(/hsl\(220|hsl\(145|hsl\(38|hsl\(0, 72|hsl\(200|hsl\(280/);
  });
  it('P1: no font-display on tabular numbers (Settlements/Wallet)', () => {
    const s = byName('SettlementsPage.tsx') + byName('WalletPage.tsx');
    expect(s).not.toMatch(/font-display[^"\n]*tabular-nums|tabular-nums[^"\n]*font-display/);
  });
  it('P1: Fraud audit rows are tabular, not JSON.stringify', () => {
    expect(byName('FraudPage.tsx')).not.toMatch(/JSON\.stringify\(row\)/);
  });
  it('P1: Wallet pagination uses Button, not href=#', () => {
    expect(byName('WalletPage.tsx')).not.toMatch(/href="#"/);
  });
  it('P0: Reconciliation file input is focusable (no display:none hidden)', () => {
    expect(byName('ReconciliationPage.tsx')).not.toMatch(/type="file"[^>]*className="hidden"/);
  });
  it('P0/P1: Reconciliation icon buttons have aria-labels', () => {
    const src = byName('ReconciliationPage.tsx');
    expect(src).toMatch(/aria-label="Mark matched"/);
    expect(src).toMatch(/aria-label="Mark disputed"/);
    expect(src).toMatch(/aria-label="Edit notes"/);
  });
  it('P1: skeletons (.shimmer) + aria-busy on every finance surface', () => {
    for (const [i, name] of [
      'SettlementsPage.tsx',
      'RevenueSharingPage.tsx',
      'WalletPage.tsx',
      'PayrollPage.tsx',
      'ReconciliationPage.tsx',
      'ExpenseTypesPage.tsx',
      'AnalyticsPage.tsx',
      'FraudPage.tsx',
    ].entries()) {
      const src = GROUP[i];
      expect(src, `${name} skeleton`).toMatch(/shimmer/);
      expect(src, `${name} aria-busy`).toMatch(/aria-busy/);
    }
    expect(widgetSrc).toMatch(/shimmer/);
  });
  it('P1: WalletWidget returns skeleton, not null, when loading/empty', () => {
    expect(widgetSrc).not.toMatch(/if \(loading \|\| wallets\.length === 0\) return null/);
  });
  it('P1: Settlements uses local expenses var (no stale allExpenses in summaries)', () => {
    const src = byName('SettlementsPage.tsx');
    expect(src).not.toMatch(/allExpenses\.filter/);
  });
  it('P1/P2: money uses D + toFixed(2) and tabular-nums; dates use <time>', () => {
    expect(allGroupSrc).toMatch(/tabular-nums/);
    expect(allGroupSrc).toMatch(/<time/);
    expect(allGroupSrc).toMatch(/\.toFixed\(2\)/);
  });
  it('P0: all 6 Analytics charts have role=img + aria-label + sr-only data table', () => {
    const src = byName('AnalyticsPage.tsx') + byName('AnalyticsCharts.tsx');
    const roles = (src.match(/role="img"/g) || []).length;
    expect(roles).toBeGreaterThanOrEqual(6);
    expect(src).toMatch(/sr-only/);
  });
  it('P1: Labels use htmlFor/id', () => {
    expect(allGroupSrc).toMatch(/htmlFor="/);
  });
  it('P1: Reconciliation table has overflow-x-auto wrapper', () => {
    expect(byName('ReconciliationPage.tsx')).toMatch(/overflow-x-auto/);
  });

  // F1 (FRICTION-ANALYSIS-2026-09-18): bulk money writes must be honest about
  // partial failure. A bare per-id error toast loop hides which rows landed;
  // the UI must summarize counts (and ids) in the failure copy.
  describe('F1: honest bulk-write summaries', () => {
    it('summarizeBulkResult reports partial failure with failed ids', () => {
      const r = summarizeBulkResult([
        { id: 'a', error: null },
        { id: 'b', error: new Error('rls') },
      ]);
      expect(r.succeeded).toBe(1);
      expect(r.failed).toBe(1);
      expect(r.failedIds).toEqual(['b']);
    });
    it('summarizeBulkResult: all-success has empty failedIds', () => {
      const r = summarizeBulkResult([{ id: 'a', error: null }]);
      expect(r.failed).toBe(0);
      expect(r.failedIds).toEqual([]);
    });
    it('ReconciliationPage sums bulk results instead of bare per-id toasts', () => {
      expect(byName('ReconciliationPage.tsx')).toMatch(/summarizeBulkResult/);
    });
    it('SettlementsPage payout loop announces partial failures', () => {
      expect(byName('SettlementsPage.tsx')).toMatch(/failedIds\.length|failedIds\.map/);
    });
  });

  // F4 (FRICTION-ANALYSIS-2026-09-18): pending labels that can never render
  // (state vocabulary 'verify'/'reject' vs action vocabulary 'matched'/'disputed')
  // leave a double-submit window on money rows. One vocabulary end-to-end.
  it('F4: Reconciliation bulkActionPending uses the DB status vocabulary', () => {
    expect(byName('ReconciliationPage.tsx')).toMatch(/bulkActionPending.*'matched' \| 'disputed' \| null/);
  });

  // F10 (FRICTION-ANALYSIS-2026-09-18): an invisible selection that survives a
  // filter change is a money-safety trap — the user can bulk-act on rows they
  // can no longer see. Selection must clear whenever the visible set can change.
  it('F10: reconciliation selection clears on any filter-shape change', () => {
    const src = byName('ReconciliationPage.tsx');
    expect(src).toMatch(/buildWithdrawalFilterKey|filterKey/);
    expect(src).toMatch(/setSelectedIds\(new Set\(\)\)/);
  });

  // F2 (FRICTION-ANALYSIS-2026-09-18): bulk destructive actions on money rows
  // need a confirm interposition, not a one-click footer button.
  it('F2: reconciliation bulk reject confirms before firing', () => {
    const src = byName('ReconciliationPage.tsx');
    expect(src).toMatch(/bulkConfirm/);
  });

  // F5 (FRICTION-ANALYSIS-2026-09-18): money buttons name the amount — the
  // PaymentBackfillPage pattern. Amount-only buttons force mental arithmetic
  // before every confirm.
  it('F5: settlements payout button names the amount', () => {
    expect(byName('SettlementsPage.tsx')).toMatch(/Pay .* — pay D|formatMoney\(.*net_payout/);
  });

  // F3: export buttons state the row scope — a CSV that silently differs from
  // the screen is a reconciliation trust failure.
  it('F3: export buttons state row scope', () => {
    expect(byName('ReconciliationPage.tsx')).toMatch(/Export filtered \(/);
  });

  // P2-NEW-6 regression guard: CONTEXT.md makes Merchant canonical; the
  // customer-facing purchase funnel had purged "Restaurant" copy once
  // (febbd5b) and it regressed. Lock it.
  it('F-copy: purchase funnel has no customer-facing "Restaurant" copy', () => {
    expect(byName('CartPage.tsx')).not.toMatch(/restaurant/i);
    expect(byName('MerchantStorefrontPage.tsx')).not.toMatch(/Restaurant not found/i);
    // ShopPage section label previously said "Open restaurants"; heading says "Open near you"
    expect(byName('ShopPage.tsx')).not.toMatch(/restaurant/i);
  });

  // Copy-audit 2026-09-18 (humanizer + GCSE lens): funnel copy register.
  describe('F-copy2: funnel copy audit guards', () => {
    it('ShopPage subhead drops the em-dash approval jargon', () => {
      const s = byName('ShopPage.tsx');
      expect(s).toMatch(/Order from local stores\./);
      expect(s).not.toMatch(/Approved local businesses/);
    });
    it('Checkout pay button uses formatMoney (no hand-rolled D toFixed)', () => {
      const s = byName('CheckoutPage.tsx');
      expect(s).toMatch(/Pay \$\{formatMoney\(total\)\} with ModemPay/);
      expect(s).not.toMatch(/D \$\{total\.toFixed/);
    });
    it('Checkout sign-in prompt has no em dash', () => {
      expect(byName('CheckoutPage.tsx')).not.toMatch(/to continue —/);
    });
    it('ProductDetail not-found copy has no dev jargon ("stale")', () => {
      expect(byName('ProductDetailPage.tsx')).toMatch(/link is out of date/);
    });
    it('MerchantStorefront not-found copy speaks shopper language', () => {
      expect(byName('MerchantStorefrontPage.tsx')).toMatch(/This store is unavailable\./);
    });
  });

  // P2-NEW-5 regression guard: wallet family back on hand-rolled D toFixed(2).
  it('F-money: wallet family uses formatMoney, not hand-rolled D toFixed(2)', () => {
    const walletFamily = [
      read(path.join(compDir, 'wallet/WalletFolderCard.tsx')),
      read(path.join(compDir, 'wallet/TransactionHistoryTable.tsx')),
    ].join('\n');
    expect(walletFamily).toMatch(/formatMoney/);
    expect(walletFamily).not.toMatch(/D \{Number\(|D \{[a-zA-Z_]/);
  });

  // F8 (FRICTION-ANALYSIS-2026-09-18): chat unread pill without a preview
  // snippet forces a tap per order just to learn what was said — recognition
  // over recall. The collapsed chat header must expose the last message.
  it('F8: collapsed chat header exposes a last-message preview', () => {
    const orderCard = byName('MyOrdersPage.tsx');
    expect(orderCard).toMatch(/previewBody/);
  });
  it('F8: OrderChat supports an onLastMessage callback', () => {
    expect(read(path.join(compDir, 'OrderChat.tsx'))).toMatch(/onLastMessage/);
  });
});
