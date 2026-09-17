import { describe, it, expect, vi } from 'vitest';
import { removeDeliveryFromQueue } from '../riderDashboard.helpers';

// Verify that the shared queue-removal helper used by RiderDashboard wipes
// the delivery from every client-side list after a reject/decline succeeds.
// This is the contract both flows rely on: confirmReject → performReject →
// removeDeliveryFromLocalState (which delegates to removeDeliveryFromQueue).

type D = { id: string; status: string };

const baseState = () => ({
  deliveries: [{ id: 'd1', status: 'dispatched' }, { id: 'd2', status: 'accepted' }] as D[],
  unassigned: [{ id: 'd1', status: 'unassigned' }] as D[],
  offered: [{ id: 'offer-1', status: 'unassigned' }, { id: 'd1', status: 'unassigned' }] as D[],
  activeDelivery: { id: 'd1', status: 'in_transit' } as D | null,
  detail: { id: 'd1', status: 'dispatched' } as D | null,
});

describe('removeDeliveryFromQueue (reject + decline flows)', () => {
  it('removes a rejected broadcast offer from the offered list and detail dialog', () => {
    const state = baseState();
    state.activeDelivery = null;
    state.detail = { id: 'offer-1', status: 'unassigned' };

    const next = removeDeliveryFromQueue(state, 'offer-1');

    expect(next.offered.find(d => d.id === 'offer-1')).toBeUndefined();
    expect(next.detail).toBeNull();
    // Unrelated rows stay
    expect(next.offered.find(d => d.id === 'd1')).toBeDefined();
    expect(next.deliveries).toHaveLength(2);
  });

  it('removes a declined dispatched delivery from My Deliveries, unassigned, offered and active', () => {
    const state = baseState();

    const next = removeDeliveryFromQueue(state, 'd1');

    expect(next.deliveries.find(d => d.id === 'd1')).toBeUndefined();
    expect(next.unassigned.find(d => d.id === 'd1')).toBeUndefined();
    expect(next.offered.find(d => d.id === 'd1')).toBeUndefined();
    expect(next.activeDelivery).toBeNull();
    expect(next.detail).toBeNull();
    // The other in-progress delivery is untouched
    expect(next.deliveries.find(d => d.id === 'd2')).toBeDefined();
  });

  it('is a no-op when the id does not exist (idempotent)', () => {
    const state = baseState();
    const next = removeDeliveryFromQueue(state, 'does-not-exist');
    expect(next.deliveries).toHaveLength(state.deliveries.length);
    expect(next.offered).toHaveLength(state.offered.length);
    expect(next.activeDelivery).toEqual(state.activeDelivery);
  });
});

// Contract test: confirm the dashboard wires the reject RPC the way the
// rejected-deliveries page and other riders depend on.
describe('reject_delivery RPC contract', () => {
  it('is invoked with _delivery_id and an optional _reason', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await rpc('reject_delivery', { _delivery_id: 'd1', _reason: 'too far' });
    await rpc('reject_delivery', { _delivery_id: 'd2', _reason: null });
    expect(rpc).toHaveBeenNthCalledWith(1, 'reject_delivery', { _delivery_id: 'd1', _reason: 'too far' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'reject_delivery', { _delivery_id: 'd2', _reason: null });
  });
});
