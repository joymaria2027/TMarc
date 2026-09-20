import { describe, it, expect, vi } from 'vitest';

/**
 * Ticket: production white pages + `TypeError: can't access property "rest",
 * this is undefined` thrown from inside the minified `rpc` helper.
 *
 * postgrest-js implements `rpc` as a method that reads `this.rest`. The
 * `rpcGetUnassignedDeliveriesForRider` wrapper detached it
 * (`const call = supabase.rpc; call(...)`), so `this` arrives as `undefined`
 * in strict-mode ESM and every call explodes. The pages that await it
 * (RiderDashboard.loadUnassigned, RejectedDeliveriesPage load) never finish
 * loading — hence skeletons forever / white pages.
 *
 * This test pins the receiver: the wrapper must invoke `rpc` as a method on
 * the supabase client object.
 */

const { clientState } = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ fn: string; receiverOk: boolean }>,
    rows: [{ id: 'd1' }],
  };
  return { clientState: state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // Regular function (not arrow) so `this` reflects the call form —
    // exactly like postgrest-js, which reads `this.rest` internally.
    async rpc(this: unknown, fn: string) {
      const receiverOk = this !== undefined;
      clientState.calls.push({ fn, receiverOk });
      if (!receiverOk) {
        throw new TypeError(`can't access property "rest", this is undefined`);
      }
      return { data: clientState.rows, error: null };
    },
  },
}));

import { rpcGetUnassignedDeliveriesForRider } from '@/lib/rpcTypes';

describe('rpcGetUnassignedDeliveriesForRider preserves the supabase receiver', () => {
  it('calls rpc as a method (this !== undefined) with the unassigned-pool fn', async () => {
    await expect(rpcGetUnassignedDeliveriesForRider()).resolves.toEqual({
      data: [{ id: 'd1' }],
      error: null,
    });
    expect(clientState.calls).toEqual([
      { fn: 'get_unassigned_deliveries_for_rider', receiverOk: true },
    ]);
  });
});
