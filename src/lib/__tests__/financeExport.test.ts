import { describe, it, expect } from 'vitest';
import {
  buildCsvRows,
  escapeCsvCell,
  rowsToCsv,
  generateFilename,
  generateExportFilename,
} from '@/lib/financeExport';

describe('financeExport helpers', () => {
  describe('buildCsvRows', () => {
    it('returns header + rows with visible columns only', () => {
      type Row = { id: string; name: string; amount: number; hidden: string };
      const rows: Row[] = [
        { id: '1', name: 'Alice', amount: 100.5, hidden: 'secret' },
        { id: '2', name: 'Bob', amount: 200, hidden: 'also secret' },
      ];
      const columns = [
        { key: 'id', header: 'ID' },
        { key: 'name', header: 'Name' },
        { key: 'amount', header: 'Amount', format: (v) => Number(v).toFixed(2) },
      ];
      const result = buildCsvRows(rows, columns);
      expect(result).toEqual([
        ['ID', 'Name', 'Amount'],
        ['1', 'Alice', '100.50'],
        ['2', 'Bob', '200.00'],
      ]);
    });

    it('handles empty rows', () => {
      const result = buildCsvRows([], [{ key: 'id', header: 'ID' }]);
      expect(result).toEqual([['ID']]);
    });

    it('escapes null/undefined as empty string', () => {
      type Row = { id: string; name: string | null | undefined };
      const rows: Row[] = [{ id: '1', name: null }, { id: '2', name: undefined }];
      const result = buildCsvRows(rows, [{ key: 'id', header: 'ID' }, { key: 'name', header: 'Name' }]);
      expect(result).toEqual([
        ['ID', 'Name'],
        ['1', ''],
        ['2', ''],
      ]);
    });

    it('formats numbers as strings with 2 decimals by default', () => {
      const rows = [{ id: '1', value: 42 }];
      const result = buildCsvRows(rows, [{ key: 'id', header: 'ID' }, { key: 'value', header: 'Value' }]);
      expect(result[1][1]).toBe('42.00');
    });
  });

  describe('escapeCsvCell', () => {
    it('wraps cells with commas in quotes', () => {
      expect(escapeCsvCell('a,b')).toBe('"a,b"');
    });
    it('escapes double quotes', () => {
      expect(escapeCsvCell('a"b')).toBe('"a""b"');
    });
    it('wraps cells with newlines', () => {
      expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    });
    it('leaves simple cells unchanged', () => {
      expect(escapeCsvCell('simple')).toBe('simple');
    });
  });

  describe('rowsToCsv', () => {
    it('joins rows with newlines and cells with commas', () => {
      expect(rowsToCsv([['A', 'B'], ['1', '2']])).toBe('A,B\n1,2');
    });
    it('applies escaping', () => {
      expect(rowsToCsv([['Name', 'Desc'], ['Bob', 'has, comma']])).toBe('Name,Desc\nBob,"has, comma"');
    });
  });

  describe('generateFilename', () => {
    it('produces page-YYYYMMDD.csv format', () => {
      const name = generateFilename('reconciliation');
      expect(name).toMatch(/^reconciliation-\d{8}\.csv$/);
    });
  });

  // F3 (FRICTION-ANALYSIS-2026-09-18): the exported file must carry its own
  // scope so an accountant can tell what a CSV contains without re-deriving it.
  describe('generateExportFilename (export scope in filename)', () => {
    it('includes scope and row count', () => {
      const name = generateExportFilename('reconciliation', { scope: 'filtered', rowCount: 42 });
      expect(name).toMatch(/^reconciliation-\d{8}-filtered-42rows\.csv$/);
    });
    it('pluralizes row count correctly', () => {
      expect(generateExportFilename('reconciliation', { scope: 'filtered', rowCount: 1 })).toMatch(/-1row\.csv$/);
      expect(generateExportFilename('reconciliation', { scope: 'filtered', rowCount: 0 })).toMatch(/-0rows\.csv$/);
    });
    it('defaults scope to filtered', () => {
      expect(generateExportFilename('wallet-withdrawals', { rowCount: 7 })).toMatch(/^wallet-withdrawals-\d{8}-filtered-7rows\.csv$/);
    });
  });
});