import { describe, it, expect } from 'vitest';
import { findActiveDelivery } from '../riderDashboard.helpers';

// Ticket: after Accept, the delivery jumped straight into the Active Delivery
// card (with End Delivery), skipping the start-mileage odometer stage.
// Root cause: loadDeliveries treated `accepted` as active, so the realtime
// reload promoted the just-accepted row to Active before Start was tapped.
// Contract: only a started run (picked_up / in_transit) is Active; an
// accepted delivery stays in My queue behind the Start Delivery button,
// which is what opens the start-odometer dialog.

type D = { id: string; status: string };

describe('findActiveDelivery (accept must not auto-start)', () => {
  it('returns null when the newest row is merely accepted', () => {
    expect(findActiveDelivery([{ id: 'd1', status: 'accepted' }] as D[])).toBeNull();
  });

  it('returns null for queue and terminal statuses', () => {
    const rows = [
      { id: 'd1', status: 'dispatched' },
      { id: 'd2', status: 'accepted' },
      { id: 'd3', status: 'delivered' },
      { id: 'd4', status: 'cancelled' },
    ] as D[];
    expect(findActiveDelivery(rows)).toBeNull();
  });

  it('promotes a started run (in_transit, picked_up) to Active', () => {
    expect(findActiveDelivery([{ id: 'd9', status: 'in_transit' }] as D[])?.id).toBe('d9');
    expect(findActiveDelivery([{ id: 'd8', status: 'picked_up' }] as D[])?.id).toBe('d8');
  });

  it('prefers the started run and leaves accepted rows in the queue', () => {
    const rows = [
      { id: 'd1', status: 'accepted' },
      { id: 'd2', status: 'in_transit' },
    ] as D[];
    expect(findActiveDelivery(rows)?.id).toBe('d2');
  });

  it('is null-safe on empty lists', () => {
    expect(findActiveDelivery([])).toBeNull();
  });
});
