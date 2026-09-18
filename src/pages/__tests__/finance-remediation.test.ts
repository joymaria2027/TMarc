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
});
