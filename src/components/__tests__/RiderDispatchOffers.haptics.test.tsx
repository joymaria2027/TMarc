import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RiderDispatchOffers from '../RiderDispatchOffers';

/**
 * Key-moment haptics (issue: haptics-key-moments/01).
 *
 * The dispatch-offer accept is the highest-pressure tap a rider makes; it
 * should feel confirmed. Accept → success notification; the offer list's
 * sibling decline path → light impact.
 */

const hapticSpies = vi.hoisted(() => ({
  impact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  selectionChanged: vi.fn(),
}));

vi.mock('@/lib/haptics', () => ({
  haptics: hapticSpies,
}));

const { fromSpy, rpcSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(),
  rpcSpy: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromSpy,
    rpc: rpcSpy,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const OFFER = {
  delivery_id: 'd1',
  order_id: 'ord1',
  order_reference: 'DG-2001',
  merchant_name: 'Test Merchant',
  pickup_lat: 13.45,
  pickup_lng: -16.72,
  dropoff_address: '12 Test Street',
  dropoff_lat: 13.46,
  dropoff_lng: -16.71,
  estimated_tariff: 85,
  offered_at: new Date().toISOString(),
  expires_at: null,
};

beforeEach(() => {
  fromSpy.mockReset();
  fromSpy.mockImplementation(() => Promise.resolve({ data: [], error: null }));
  rpcSpy.mockReset();
  rpcSpy.mockImplementation((fn: string) => {
    if (fn === 'get_offered_orders_for_rider') {
      return Promise.resolve({ data: [OFFER], error: null });
    }
    return Promise.resolve({ data: true, error: null });
  });
  for (const s of Object.values(hapticSpies)) s.mockClear();
});

describe('RiderDispatchOffers haptics (haptics-key-moments/01)', () => {
  it('confirms an accepted offer with a success haptic', async () => {
    render(<RiderDispatchOffers />);
    const accept = await screen.findByRole('button', { name: /accept delivery/i });
    fireEvent.click(accept);

    await waitFor(() => expect(hapticSpies.success).toHaveBeenCalled());
  });

  it('fires the accept haptic only when the claim wins (not on lost races)', async () => {
    rpcSpy.mockImplementation((fn: string) => {
      if (fn === 'get_offered_orders_for_rider') return Promise.resolve({ data: [OFFER], error: null });
      return Promise.resolve({ data: false, error: null }); // another rider won
    });
    render(<RiderDispatchOffers />);
    const accept = await screen.findByRole('button', { name: /accept delivery/i });
    fireEvent.click(accept);

    await waitFor(() => expect(rpcSpy).toHaveBeenCalledWith('claim_dispatched_order', { _order_id: 'ord1' }));
    expect(hapticSpies.success).not.toHaveBeenCalled();
  });
});
