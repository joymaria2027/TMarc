import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OfferCard from '../OfferCard';
import type { OfferDelivery } from '../OfferCard';

// Slice 07 contract: the card states the consequence of Accept before the
// rider taps — exact payout when the share is known, plain assignment when not.
const delivery: OfferDelivery = {
  id: 'offer-1',
  order_reference: 'DG-101',
  pickup_address: 'Pickup St',
  dropoff_address: 'Drop Ave',
  merchant_id: 'm1',
  estimated_tariff: 800,
  merchants: { name: 'Test Store' },
};

const renderCard = (overrides: Partial<Parameters<typeof OfferCard>[0]> = {}) =>
  render(
    <OfferCard
      delivery={delivery}
      distanceKm={2.5}
      tariff={800}
      riderShare={null}
      onView={vi.fn()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
      {...overrides}
    />
  );

describe('OfferCard Accept hint (slice 07 contract)', () => {
  it('names the locked payout when the share is known', () => {
    renderCard({ riderShare: 640, revShare: { rider_percentage: 80, merchant_percentage: 10, ucs_rides_percentage: 5, platform_percentage: 5 } });
    expect(screen.getByText('Accept assigns this Delivery to you at D640.00 (80%).')).toBeInTheDocument();
  });

  it('falls back to plain assignment without share data', () => {
    renderCard();
    expect(screen.getByText('Accept assigns this Delivery to you.')).toBeInTheDocument();
  });

  it('keeps Accept/Reject working and copy plain', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderCard({ onAccept, onReject });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledTimes(1);
    const hint = screen.getByText(/Accept assigns this Delivery/);
    expect(hint.textContent).not.toMatch(/—|–/);
    expect(hint.textContent).not.toMatch(/\b(driver|courier|restaurant|store|job)\b/i);
  });
});
