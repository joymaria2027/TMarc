/** CSV export helpers for finance pages. */

export interface CsvColumn<T> {
  key: keyof T | string;
  header: string;
  format?: (value: T[keyof T] | unknown) => string;
}

export function buildCsvRows<T>(
  rows: T[],
  columns: CsvColumn<T>[]
): string[][] {
  const header = columns.map(c => c.header);
  const body = rows.map(row =>
    columns.map(col => {
      const key = col.key as keyof T;
      const value = row[key];
      if (col.format) return col.format(value);
      if (value === null || value === undefined) return '';
      if (typeof value === 'number') return value.toFixed(2);
      return String(value);
    })
  );
  return [header, ...body];
}

export function escapeCsvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map(r => r.map(escapeCsvCell).join(',')).join('\n');
}

export function downloadCsv(
  rows: string[][],
  filename: string
): void {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateFilename(page: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${page}-${yyyy}${mm}${dd}.csv`;
}

/**
 * Export filename that carries its own scope (F3, FRICTION-ANALYSIS-2026-09-18):
 * an accountant can tell what a CSV contains from the file alone, and the
 * button label can quote the same row count the file will hold.
 */
export function generateExportFilename(
  page: string,
  opts: { scope?: 'filtered' | 'all'; rowCount: number }
): string {
  const { scope = 'filtered', rowCount } = opts;
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const noun = rowCount === 1 ? 'row' : 'rows';
  return `${page}-${stamp}-${scope}-${rowCount}${noun}.csv`;
}