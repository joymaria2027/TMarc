import { describe, it, expect } from 'vitest';
import { pageRange } from '@/lib/pagination';
import { fetchDeliveriesPage, fetchUnassignedPage, fetchDeliveriesCount } from '../deliveries';
import { fetchRidersPage, fetchRidersCount } from '../riders';
import { fetchExpensesPage, fetchExpensesCount } from '../expenses';

// Recording supabase stub: every chainable returns the proxy, `range`
// resolves the canned result, and awaiting the builder (count/head path)
// resolves the same result via `then`.
function recordingClient(result: unknown) {
  const calls: string[] = [];
  const show = (a: unknown) => JSON.stringify(a);
  const target: Record<string, (...args: unknown[]) => unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop: string | symbol) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result);
      return (...args: unknown[]) => {
        calls.push(`${String(prop)}(${args.map(show).join(',')})`);
        if (prop === 'range') return Promise.resolve(result);
        return proxy;
      };
    },
  });
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`);
      return proxy;
    },
  };
  return { client, calls };
}

const asClient = (c: unknown) => c as Parameters<typeof fetchDeliveriesPage>[0]['client'];

describe('pageRange (server pagination math)', () => {
  it('page 1 size 20 → rows 0..19', () => {
    expect(pageRange(1, 20)).toEqual({ from: 0, to: 19 });
  });
  it('page 2 size 20 → rows 20..39', () => {
    expect(pageRange(2, 20)).toEqual({ from: 20, to: 39 });
  });
  it('page 3 size 10 → rows 20..29', () => {
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });
  it('clamps page 0 / negative / fractional to page 1', () => {
    expect(pageRange(0, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(-2, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(1.7, 20)).toEqual({ from: 0, to: 19 });
  });
});

describe('fetchDeliveriesPage', () => {
  it('ranges page 1 without status filter for status=all', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchDeliveriesPage({ status: 'all', page: 1, pageSize: 20, client: asClient(client) });
    expect(calls).toContain('from(deliveries)');
    expect(calls).toContain('range(0,19)');
    expect(calls.some((c) => c.startsWith('eq('))).toBe(false);
  });
  it('adds eq(status) and ranges page 2', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchDeliveriesPage({ status: 'dispatched', page: 2, pageSize: 20, client: asClient(client) });
    expect(calls).toContain('eq("status","dispatched")');
    expect(calls).toContain('range(20,39)');
  });
  it('throws on query error', async () => {
    const { client } = recordingClient({ data: null, error: { message: 'boom' } });
    await expect(fetchDeliveriesPage({ client: asClient(client) })).rejects.toMatchObject({
      message: 'boom',
    });
  });
});

describe('fetchUnassignedPage', () => {
  it('filters unassigned/pending with null rider and ranges', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchUnassignedPage({ page: 1, pageSize: 10, client: asClient(client) });
    expect(calls).toContain('in("status",["unassigned","pending"])');
    expect(calls).toContain('is("rider_id",null)');
    expect(calls).toContain('range(0,9)');
  });
  it('excludes rejected ids when provided', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchUnassignedPage({ excludeIds: ['a', 'b'], client: asClient(client) });
    expect(calls).toContain('not("id","in","(a,b)")');
  });
});

describe('fetchDeliveriesCount', () => {
  it('returns the exact count', async () => {
    const { client } = recordingClient({ data: null, error: null, count: 42 });
    await expect(fetchDeliveriesCount({ client: asClient(client) })).resolves.toBe(42);
  });
});

describe('fetchRidersPage / fetchRidersCount', () => {
  it('ranges page 1 and filters activeOnly', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchRidersPage({ page: 1, pageSize: 20, activeOnly: true, client: client as never });
    expect(calls).toContain('from(riders)');
    expect(calls).toContain('eq("is_active",true)');
    expect(calls).toContain('range(0,19)');
  });
  it('skips the active filter by default', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchRidersPage({ client: client as never });
    expect(calls.some((c) => c.startsWith('eq('))).toBe(false);
  });
  it('returns the exact count', async () => {
    const { client } = recordingClient({ data: null, error: null, count: 7 });
    await expect(fetchRidersCount({ client: client as never })).resolves.toBe(7);
  });
});

describe('fetchExpensesPage / fetchExpensesCount', () => {
  it('scopes to riderId and ranges page 2', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchExpensesPage({ riderId: 'r1', page: 2, pageSize: 20, client: client as never });
    expect(calls).toContain('from(rider_expenses)');
    expect(calls).toContain('eq("rider_id","r1")');
    expect(calls).toContain('range(20,39)');
  });
  it('skips the rider filter when unscoped', async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchExpensesPage({ client: client as never });
    expect(calls.some((c) => c.startsWith('eq('))).toBe(false);
  });
  it('returns the exact count', async () => {
    const { client } = recordingClient({ data: null, error: null, count: 3 });
    await expect(fetchExpensesCount({ client: client as never })).resolves.toBe(3);
  });
});

describe('rpcTypes (no any-casts on rpc data)', () => {
  it('exposes typed row aliases for the 9 shared RPCs', async () => {
    const mod = await import('@/lib/rpcTypes');
    for (const name of [
      'rpcGetUnassignedDeliveriesForRider',
      'rpcGetOfferedDeliveries',
      'rpcGetRiderRejectedDeliveries',
      'rpcClaimDelivery',
      'rpcRejectDelivery',
      'rpcCancelDeliveryAcceptance',
      'rpcHasWithdrawalPin',
      'rpcVerifyWithdrawalPin',
      'rpcSetWithdrawalPin',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});
