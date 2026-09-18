/** Pure selection + bulk-resolve helpers for the ops alerts queue. */

export function toggleSelected(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function visibleIds<T extends { id: string }>(alerts: T[]): string[] {
  return alerts.map((a) => a.id);
}

/** Max characters stored for a resolve note (audit-trail reason). */
export const RESOLVE_NOTE_MAX_LENGTH = 500;

/**
 * Normalize free-text resolve notes: trim, map empty/blank to null,
 * and cap at RESOLVE_NOTE_MAX_LENGTH characters.
 */
export function normalizeResolveNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, RESOLVE_NOTE_MAX_LENGTH);
}

export interface ResolvableAlert {
  id: string;
  is_resolved: boolean;
  resolved_by: string | null;
}

/** Optimistically mark ids resolved (unknown ids ignored, others untouched). */
export function applyBulkResolve<T extends ResolvableAlert>(
  alerts: T[],
  ids: string[],
  userId: string | undefined
): T[] {
  if (ids.length === 0) return alerts;
  const set = new Set(ids);
  return alerts.map((a) =>
    set.has(a.id) && !a.is_resolved ? { ...a, is_resolved: true, resolved_by: userId ?? null } : a
  );
}

export interface ResolvedSnapshot {
  id: string;
}

/**
 * Session undo: merge snapshot rows back as unresolved (clears resolved_by).
 * Rows evicted from state (e.g. by the Active filter's realtime patch) are
 * re-added at the top so the undo is actually visible.
 */
export function applyBulkUnresolve<T extends ResolvableAlert>(
  alerts: T[],
  snapshot: T[]
): T[] {
  if (snapshot.length === 0) return alerts;
  const byId = new Map(alerts.map((a) => [a.id, a]));
  for (const s of snapshot) {
    const current = byId.get(s.id);
    byId.set(s.id, { ...(current ?? s), is_resolved: false, resolved_by: null } as T);
  }
  const snapshotIds = new Set(snapshot.map((s) => s.id));
  const restored = snapshot.map((s) => byId.get(s.id) as T);
  const rest = alerts.filter((a) => !snapshotIds.has(a.id));
  return [...restored, ...rest];
}
