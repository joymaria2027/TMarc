import { describe, it, expect, vi } from 'vitest';
import {
  markRiderOnlineByUserId,
  markRiderOfflineByUserId,
  markRiderOnlineByRiderId,
  markRiderOfflineByRiderId,
} from '@/lib/riderPresence';

function mockClient() {
  const updates: Array<{ table: string; values: unknown; col: string; val: unknown }> = [];
  const client = {
    from: (table: string) => ({
      update: (values: unknown) => ({
        eq: (col: string, val: unknown) => {
          updates.push({ table, values, col, val });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { client: client as never, updates };
}

describe('riderPresence (ticket: signed-in rider is automatically online)', () => {
  it('marks rider online+active by user_id on sign-in', async () => {
    const { client, updates } = mockClient();
    await markRiderOnlineByUserId('u1', client);
    expect(updates).toEqual([
      { table: 'riders', values: { is_online: true, is_active: true }, col: 'user_id', val: 'u1' },
    ]);
  });

  it('marks rider offline by user_id on sign-out (keeps is_active untouched)', async () => {
    const { client, updates } = mockClient();
    await markRiderOfflineByUserId('u1', client);
    expect(updates).toEqual([
      { table: 'riders', values: { is_online: false }, col: 'user_id', val: 'u1' },
    ]);
  });

  it('supports rider-id variants for dashboard imperative paths', async () => {
    const { client, updates } = mockClient();
    await markRiderOnlineByRiderId('r1', client);
    await markRiderOfflineByRiderId('r1', client);
    expect(updates).toEqual([
      { table: 'riders', values: { is_online: true, is_active: true }, col: 'id', val: 'r1' },
      { table: 'riders', values: { is_online: false }, col: 'id', val: 'r1' },
    ]);
  });

  it('no-ops on empty ids (sign-out race safety)', async () => {
    const { client, updates } = mockClient();
    await markRiderOnlineByUserId('', client);
    await markRiderOfflineByUserId(null as unknown as string, client);
    expect(updates).toEqual([]);
    expect(vi.fn().mock.calls.length).toBe(0);
  });
});
