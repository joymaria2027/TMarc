export function pageCount(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginate<T>(list: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

export function clampPage(page: number, totalItems: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCount(totalItems, pageSize));
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
