import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.resolve(__dirname, '..');
const compDir = path.resolve(__dirname, '../../components');
const read = (p: string) => fs.readFileSync(p, 'utf8');
const revSrc = () => read(path.join(srcDir, 'RevenueSharingPage.tsx'));
const folderSrc = () =>
  read(path.join(compDir, 'wallet/WalletFolderCard.tsx'));

describe('04-rider-wallet-tables-fix: no ghost checkbox gutter', () => {
  it('selection th renders only when canManage', () => {
    expect(revSrc()).toMatch(/\{canManage && \(\s*<TableHead className="w-12">/);
    expect(revSrc()).not.toMatch(
      /<TableHead className="w-12">\s*\{canManage/,
    );
  });
});

describe('04-rider-wallet-tables-fix: compact rider sub-text', () => {
  it('rider sub-text fits narrow columns', () => {
    expect(revSrc()).toMatch(/'Default rate'/);
    expect(revSrc()).not.toMatch(/Default rate for this merchant/);
  });
});

describe('04-rider-wallet-tables-fix: wallet label does not crush', () => {
  it('wallet label cell keeps one line so the table scrolls', () => {
    expect(folderSrc()).toMatch(
      /<TableCell className="font-medium whitespace-nowrap">\{label\}<\/TableCell>/,
    );
  });
});
