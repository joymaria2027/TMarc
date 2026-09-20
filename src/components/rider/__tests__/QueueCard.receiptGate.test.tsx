import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QueueCard from '../QueueCard';
import { canMarkCompleted } from '../../../pages/riderDashboard.helpers';

// Anti-abuse: Mark Completed pays out via settlement, so it must require
// proof. An accepted delivery with no attached receipt cannot be completed;
// the rider must attach the receipt first (or run the Start/GPS flow).
//
// handover-code/02: the receipt gate is now the FIRST gate. A passed gate
// opens the customer handover-code dialog instead of completing directly.

vi.mock('../CompletionCodeDialog', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div>handover-code-dialog</div> : null,
}));

const base = {
  id: 'd1',
  status: 'accepted',
  order_reference: 'ORD-1',
  pickup_address: 'Pickup St',
  dropoff_address: 'Drop Ave',
  estimated_tariff: 100,
};

const noop = () => {};
const statusColor = () => '';

function renderCard(receipt_attached?: boolean | null) {
  const onMarkCompleted = vi.fn();
  render(
    <QueueCard
      delivery={{ ...base, receipt_attached }}
      hasActiveDelivery={false}
      statusColor={statusColor}
      onAccept={noop}
      onDecline={noop}
      onStart={noop}
      onMarkCompleted={onMarkCompleted}
      onCancelAcceptance={noop}
      onPaymentSaved={noop}
      userId="u1"
      onReceiptUploaded={noop}
    />,
  );
  return { onMarkCompleted };
}

describe('canMarkCompleted gate', () => {
  it('refuses accepted deliveries with no receipt', () => {
    expect(canMarkCompleted({ status: 'accepted', receipt_attached: false })).toBe(false);
    expect(canMarkCompleted({ status: 'accepted', receipt_attached: null })).toBe(false);
    expect(canMarkCompleted({ status: 'accepted' })).toBe(false);
  });

  it('refuses non-accepted statuses even with a receipt', () => {
    expect(canMarkCompleted({ status: 'dispatched', receipt_attached: true })).toBe(false);
    expect(canMarkCompleted({ status: 'in_transit', receipt_attached: true })).toBe(false);
    expect(canMarkCompleted({ status: 'delivered', receipt_attached: true })).toBe(false);
  });

  it('allows accepted deliveries with an attached receipt', () => {
    expect(canMarkCompleted({ status: 'accepted', receipt_attached: true })).toBe(true);
  });
});

describe('QueueCard Mark Completed receipt gate', () => {
  it('disables Mark Completed and names the missing proof without a receipt', () => {
    const { onMarkCompleted } = renderCard(false);
    const btn = screen.getByRole('button', { name: /mark completed/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/attach a receipt first/i)).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onMarkCompleted).not.toHaveBeenCalled();
  });

  it('opens the handover-code dialog once the receipt is attached', () => {
    const { onMarkCompleted } = renderCard(true);
    const btn = screen.getByRole('button', { name: /mark completed/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    // Receipt gate passed → code gate next: the update fires only after the
    // customer's handover code is verified inside the dialog.
    expect(screen.getByText('handover-code-dialog')).toBeInTheDocument();
    expect(onMarkCompleted).not.toHaveBeenCalled();
  });
});
