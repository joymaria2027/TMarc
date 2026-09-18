import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Payload = { eventType: string; new?: unknown; old?: unknown };

// Fake supabase channel: captures postgres_changes callbacks, records removal.
const { handlers, removed, mockSupabase } = vi.hoisted(() => {
  const handlers: Array<(p: Payload) => void> = [];
  const removed: unknown[] = [];
  const fakeChannel = {
    on(_event: string, _config: unknown, cb: (p: Payload) => void) {
      handlers.push(cb);
      return fakeChannel;
    },
    subscribe() {
      return fakeChannel;
    },
  };
  const mockSupabase = {
    channel: (_name: string) => fakeChannel,
    removeChannel: (ch: unknown) => {
      removed.push(ch);
    },
  };
  return { handlers, removed, mockSupabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: mockSupabase }));

import { useRealtimeTable, applyRealtimePatch } from '../useRealtimeTable';

type Row = { id: string; status: string };

const lastHandler = () => handlers[handlers.length - 1];
const emit = (eventType: string, row: Row) =>
  act(() => {
    lastHandler()({ eventType, new: row, old: { id: row.id } });
  });

beforeEach(() => {
  handlers.length = 0;
  removed.length = 0;
});

describe('applyRealtimePatch (pure)', () => {
  const base: Row[] = [
    { id: 'a', status: 'dispatched' },
    { id: 'b', status: 'pending' },
  ];
  it('INSERT prepends and dedupes by id', () => {
    const next = applyRealtimePatch(base, 'INSERT', { id: 'c', status: 'unassigned' });
    expect(next.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(applyRealtimePatch(next, 'INSERT', { id: 'c', status: 'unassigned' })).toHaveLength(3);
  });
  it('UPDATE maps the matching row', () => {
    const next = applyRealtimePatch(base, 'UPDATE', { id: 'b', status: 'in_transit' });
    expect(next.find((r) => r.id === 'b')?.status).toBe('in_transit');
    expect(next.find((r) => r.id === 'a')?.status).toBe('dispatched');
  });
  it('DELETE filters the row out', () => {
    expect(applyRealtimePatch(base, 'DELETE', { id: 'a', status: '' }).map((r) => r.id)).toEqual(['b']);
  });
});

describe('useRealtimeTable (fake channel)', () => {
  it('seeds initialRows and patches INSERT→prepend, UPDATE→map, DELETE→filter', async () => {
    const { result } = renderHook(() =>
      useRealtimeTable<Row>({ channelName: 't1', table: 'deliveries', debounceMs: 10 }),
    );
    emit('INSERT', { id: 'a', status: 'unassigned' });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]).toMatchObject({ id: 'a' });

    emit('UPDATE', { id: 'a', status: 'dispatched' });
    await waitFor(() => expect(result.current.rows[0].status).toBe('dispatched'));

    emit('INSERT', { id: 'b', status: 'pending' });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['b', 'a']));

    emit('DELETE', { id: 'b', status: '' });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['a']));
  });

  it('coalesces rapid events through the debounce window', async () => {
    const { result } = renderHook(() =>
      useRealtimeTable<Row>({ channelName: 't2', table: 'deliveries', debounceMs: 30 }),
    );
    emit('INSERT', { id: 'a', status: 'unassigned' });
    emit('UPDATE', { id: 'a', status: 'dispatched' });
    emit('UPDATE', { id: 'a', status: 'in_transit' });
    await waitFor(() => expect(result.current.rows[0]?.status).toBe('in_transit'));
    expect(result.current.rows).toHaveLength(1);
  });

  it('shouldKeep drops non-qualifying INSERTs and removes on UPDATE', async () => {
    const { result } = renderHook(() =>
      useRealtimeTable<Row>({
        channelName: 't3',
        table: 'deliveries',
        debounceMs: 10,
        shouldKeep: (r) => r.status === 'unassigned' || r.status === 'pending',
      }),
    );
    emit('INSERT', { id: 'x', status: 'delivered' });
    emit('INSERT', { id: 'y', status: 'unassigned' });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['y']));
    emit('UPDATE', { id: 'y', status: 'delivered' });
    await waitFor(() => expect(result.current.rows).toHaveLength(0));
  });

  it('mergeUpdate preserves enriched fields on partial payloads', async () => {
    type Rich = Row & { label?: string };
    const { result } = renderHook(() =>
      useRealtimeTable<Rich>({
        channelName: 't4',
        table: 'riders',
        debounceMs: 10,
        initialRows: [{ id: 'r1', status: 'online', label: 'Ada' }],
        mergeUpdate: (prev, next) => ({ ...next, label: next.label ?? prev.label }),
      }),
    );
    emit('UPDATE', { id: 'r1', status: 'offline' } as Rich);
    await waitFor(() => expect(result.current.rows[0].status).toBe('offline'));
    expect(result.current.rows[0].label).toBe('Ada');
  });

  it('cleanup removes the channel on unmount', () => {
    const { unmount } = renderHook(() =>
      useRealtimeTable<Row>({ channelName: 't5', table: 'deliveries', debounceMs: 10 }),
    );
    unmount();
    expect(removed).toHaveLength(1);
  });
});
