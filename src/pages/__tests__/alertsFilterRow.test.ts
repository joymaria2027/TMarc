import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const src = () =>
  fs.readFileSync(path.resolve(__dirname, '../AlertsPage.tsx'), 'utf8');

describe('02-alerts-filter-row: search affordance + row discipline', () => {
  it('alerts search has icon, fixed widths, and native clear', () => {
    const s = src();
    expect(s).toMatch(/<Search className="pointer-events-none absolute left-3 top-1\/2 -translate-y-1\/2/);
    expect(s).toMatch(/<Input[\s\S]*?id="alerts-search"[\s\S]*?type="search"/);
    expect(s).toMatch(/<Input[\s\S]*?id="alerts-search"[\s\S]*?pl-9 w-48 sm:w-56/);
    const tag = s.match(/<Input[\s\S]*?id="alerts-search"[\s\S]*?\/>/)?.[0] ?? '';
    expect(tag).not.toMatch(/max-w-xs/);
  });

  it('search keeps id, shortcut ref, label, and reset behavior', () => {
    const s = src();
    expect(s).toMatch(/ref=\{searchRef\}/);
    expect(s).toMatch(/aria-label="Search alerts by message or type"/);
    expect(s).toMatch(/setSelected\(\[\]\); setUndoSnapshot\(null\)/);
  });

  it('both filter selects stay put', () => {
    const s = src();
    expect(s).toMatch(/aria-label="Filter by alert group"/);
    expect(s).toMatch(/aria-label="Filter by resolution status"/);
    expect(s).toMatch(/<SelectItem value="all">All Alerts<\/SelectItem>/);
  });
});
