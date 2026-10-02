/**
 * The one pagination seam.
 *
 * Pages are 1-based everywhere — UI state, this module, and the query modules
 * that call `pageRange`. The base convention is the bug this module exists to
 * prevent: the repo previously carried 1-based and 0-based `paginate` copies
 * side by side, so no two pages could share a control without an off-by-one.
 *
 * `paginate` clamps internally, so callers never hand-roll the
 * `Math.min(Math.max(1, page), pageCount)` dance.
 *
 * Interface is two functions: `paginate` for in-memory lists, `pageRange` for
 * server-side `.range()` queries. Page count and clamping are private — they
 * are this module's implementation, reachable through `PageResult`.
 */

export interface PageResult<T> {
  /** The rows for this page. */
  items: T[];
  /** 1-based page actually shown, after clamping. */
  page: number;
  /** Page size actually used, after normalization. */
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /** 1-based index of the first row on this page; 0 when empty. */
  start: number;
  /** 1-based index of the last row on this page; 0 when empty. */
  end: number;
  /** 0-based inclusive row bounds for a server `.range(from, to)` query. */
  from: number;
  to: number;
}

function pageCount(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

/**
 * Server-side range math for supabase `.range(from, to)` (inclusive both ends).
 * Pages are 1-based to match UI pagination; out-of-range input clamps to page 1.
 */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.max(1, Math.floor(pageSize) || 1);
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

/**
 * Slice one page and report everything a pager needs to render it.
 *
 * Clamps `page` into `1..pageCount` and floors a fractional page, so the
 * returned `page` is always one the caller can hand straight back.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): PageResult<T> {
  const totalItems = items.length;
  const safeSize = Math.max(1, Math.floor(pageSize) || 1);
  const totalPages = pageCount(totalItems, safeSize);

  const requested = Math.floor(page);
  const safePage = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), totalPages);

  const { from, to } = pageRange(safePage, safeSize);
  const sliced = items.slice(from, from + safeSize);

  const isEmpty = sliced.length === 0;
  return {
    items: sliced,
    page: safePage,
    pageSize: safeSize,
    totalItems,
    totalPages,
    start: isEmpty ? 0 : from + 1,
    end: isEmpty ? 0 : from + sliced.length,
    from,
    to,
  };
}