/** Pure focus-index helpers for the alerts keyboard tracer (j/k navigation). */

/**
 * Index of the next card. Clamps at the end (no wrap).
 * Returns -1 when there are no cards; unfocused (-1 or out of range) starts at 0.
 */
export function nextFocusIndex(current: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return 0;
  return Math.min(current + 1, count - 1);
}

/**
 * Index of the previous card. Clamps at the start (no wrap).
 * Returns -1 when there are no cards; unfocused starts at the last card.
 */
export function prevFocusIndex(current: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return count - 1;
  return Math.max(current - 1, 0);
}
