import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.resolve(__dirname, '..');
const compDir = path.resolve(__dirname, '../../components');
const read = (p: string) => fs.readFileSync(p, 'utf8');
const byName = (n: string) => read(path.join(srcDir, n));

const FINANCE_SEARCH = [
  'RevenueSharingPage.tsx',
  'PayrollPage.tsx',
  'RiderExpensesPage.tsx',
  'SettlementsPage.tsx',
  'ReconciliationPage.tsx',
];

describe('02-search-filter-bar-fix: search affordance', () => {
  it('finance search icons are click-through', () => {
    for (const name of FINANCE_SEARCH) {
      const src = byName(name);
      // every absolute Search icon must carry pointer-events-none
      const icons = src.match(/<Search className="[^"]*absolute[^"]*"[^>]*>/g) || [];
      expect(icons.length, `${name} has search icon`).toBeGreaterThan(0);
      for (const icon of icons) {
        expect(icon, `${name}: ${icon}`).toMatch(/pointer-events-none/);
      }
    }
  });
  it('finance search inputs use type=search', () => {
    for (const id of [
      'share-search',
      'assignment-search',
      'run-search',
      'expense-search',
      'settlement-search',
      'recon-search',
    ]) {
      const owner = FINANCE_SEARCH.map((n) => byName(n)).join('\n');
      const tag = owner.match(new RegExp(`<Input[^>]*id="${id}"[^>]*>`));
      expect(tag?.[0], id).toMatch(/type="search"/);
    }
  });
  it('settlements search renders its icon (no dead pl-9)', () => {
    expect(byName('SettlementsPage.tsx')).toMatch(/<Search[^>]*absolute[^>]*>/);
  });
});

describe('02-search-filter-bar-fix: filter-bar alignment', () => {
  it('finance filter CardContents bottom-align controls', () => {
    for (const name of FINANCE_SEARCH) {
      const src = byName(name);
      const bars =
        src.match(/<(CardContent|div) className="flex flex-col sm:flex-row gap-3[^"]*"/g) || [];
      expect(bars.length, `${name} filter bar`).toBeGreaterThan(0);
      for (const bar of bars) {
        expect(bar, `${name}: ${bar}`).toMatch(/sm:items-end/);
      }
    }
  });
});

describe('02-search-filter-bar-fix: no double-%', () => {
  it('RevenueSharing table cells show text % without Percent icon', () => {
    const src = byName('RevenueSharingPage.tsx');
    expect(src).not.toMatch(/<Percent[^>]*>/);
    expect(src).toMatch(/\{s\.rider_percentage\}%/);
  });
});

describe('02-search-filter-bar-fix: wallet search icons', () => {
  it('wallet search icons are centered + click-through', () => {
    for (const f of [
      'wallet/TransactionHistoryTable.tsx',
      'wallet/WithdrawalRequestsTable.tsx',
    ]) {
      const src = read(path.join(compDir, f));
      const icons = src.match(/<Search className="[^"]*"[^>]*>/g) || [];
      expect(icons.length, f).toBeGreaterThan(0);
      for (const icon of icons) {
        expect(icon, `${f}: ${icon}`).toMatch(/top-1\/2/);
        expect(icon, `${f}: ${icon}`).toMatch(/-translate-y-1\/2/);
        expect(icon, `${f}: ${icon}`).toMatch(/pointer-events-none/);
      }
      expect(src).not.toMatch(/left-2\.5 top-2\.5/);
    }
  });
});
