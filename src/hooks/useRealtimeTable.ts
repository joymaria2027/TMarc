import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

/** Minimal constraint: row identity. Interfaces (no implicit index
 * signature) and type aliases both satisfy this. */
export interface RealtimeRow {
  id: string;
}

interface RealtimePayload<T> {
  eventType: RealtimeEventType;
  new: T;
  old: Partial<T> & { id?: string };
}

export interface UseRealtimeTableOptions<T extends RealtimeRow> {
  /** Unique channel name for this subscription (one channel per hook instance). */
  channelName: string;
  /** Table to listen to, e.g. 'deliveries'. */
  table: string;
  schema?: string;
  /** PostgREST realtime filter, e.g. `rider_id=eq.abc`. */
  filter?: string;
  /** Batch window (ms) that coalesces rapid events into a single state update. */
  debounceMs?: number;
  initialRows?: T[];
  /**
   * Gate for INSERT/UPDATE rows (e.g. unassigned-only list).
   * Returning false drops INSERTs and removes the row on UPDATE.
   */
  shouldKeep?: (row: T) => boolean;
  /**
   * Merge strategy for UPDATE when the payload is a partial row.
   * Use to preserve enriched fields (profile, activeDelivery). Defaults to replace.
   */
  mergeUpdate?: (prev: T, next: T) => T;
  /**
   * When false the hook only debounces + notifies via onPatch without
   * maintaining its own list (notify mode for reload-driven pages).
   * Defaults to true.
   */
  autoPatch?: boolean;
  /** Side-effect hook fired for every applied event (after debounce). */
  onPatch?: (event: RealtimeEventType, row: T) => void;
}

/**
 * Pure list patch: INSERT→prepend (dedupe by id), UPDATE→map (prepend if
 * missing), DELETE→filter. Exported for unit tests.
 */
export function applyRealtimePatch<T extends RealtimeRow>(
  prev: T[],
  event: RealtimeEventType,
  row: T,
  mergeUpdate?: (prev: T, next: T) => T,
): T[] {
  switch (event) {
    case 'INSERT':
      return prev.some((r) => r.id === row.id) ? prev : [row, ...prev];
    case 'UPDATE': {
      const existing = prev.find((r) => r.id === row.id);
      if (!existing) return [row, ...prev];
      return prev.map((r) => (r.id === row.id ? (mergeUpdate ? mergeUpdate(r, row) : row) : r));
    }
    case 'DELETE':
      return prev.filter((r) => r.id !== row.id);
  }
}

/**
 * Shared realtime data layer: subscribes to ONE supabase channel for a single
 * table (with optional filter), buffers rapid postgres_changes events through
 * a debounce window, then patches local rows in place (no full reload).
 * Cleanup removes the channel. Callbacks live in refs so handler identity
 * never resubscribes the channel.
 */
export function useRealtimeTable<T extends RealtimeRow>({
  channelName,
  table,
  schema = 'public',
  filter,
  debounceMs = 150,
  initialRows = [],
  shouldKeep,
  mergeUpdate,
  autoPatch = true,
  onPatch,
}: UseRealtimeTableOptions<T>) {
  const [rows, setRows] = useState<T[]>(initialRows);
  const pendingRef = useRef<Array<{ event: RealtimeEventType; row: T }>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ shouldKeep, mergeUpdate, autoPatch, onPatch });
  callbacksRef.current = { shouldKeep, mergeUpdate, autoPatch, onPatch };

  useEffect(() => {
    const flush = () => {
      timerRef.current = null;
      const batch = pendingRef.current;
      pendingRef.current = [];
      if (batch.length === 0) return;
      const { shouldKeep: keep, mergeUpdate: merge, autoPatch: patch, onPatch: notify } = callbacksRef.current;
      if (patch) {
        setRows((prev) => {
          let next = prev;
          for (const { event, row } of batch) {
            if ((event === 'INSERT' || event === 'UPDATE') && keep && !keep(row)) {
              next = event === 'UPDATE' ? next.filter((r) => r.id !== row.id) : next;
              continue;
            }
            next = applyRealtimePatch(next, event, row, merge);
          }
          return next;
        });
      }
      if (notify) batch.forEach(({ event, row }) => notify(event, row));
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema, table, ...(filter ? { filter } : {}) },
        (payload) => {
          const p = payload as unknown as RealtimePayload<T>;
          const row = (p.eventType === 'DELETE' ? (p.old as T) : p.new) as T;
          if (!row || row.id == null) return;
          pendingRef.current.push({ event: p.eventType, row });
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(flush, debounceMs);
        },
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingRef.current = [];
      supabase.removeChannel(channel);
    };
    // Callbacks ride in refs; only subscription identity belongs here.
  }, [channelName, table, schema, filter, debounceMs]);

  return { rows, setRows };
}
