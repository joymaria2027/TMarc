import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(p, 'utf8');
const src = () => read(path.join(srcDir, 'ExpenseTypesPage.tsx'));

describe('03-fuel-icon-fix: single fuel indicator', () => {
  it('Type cell has no standalone Fuel icon', () => {
    expect(src()).not.toMatch(/\{type\.is_fuel && <Fuel/);
  });
  it('Type cell is plain text cell, no flex on td', () => {
    expect(src()).toMatch(/<TableCell className="font-medium">/);
    expect(src()).not.toMatch(/<TableCell className="font-medium flex/);
  });
  it('Category badge keeps icon+label', () => {
    expect(src()).toMatch(
      /<Badge variant="outline" className="gap-1"><Fuel[^>]*\/>Fuel<\/Badge>/,
    );
  });
});
