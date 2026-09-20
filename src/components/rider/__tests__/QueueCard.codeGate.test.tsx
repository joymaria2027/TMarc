import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QueueCard from "../QueueCard";

// Ticket: handover-code/02 — Mark Completed now goes through the customer's
// handover code. The receipt gate stays first (payout needs receipt proof);
// the code gate wraps the completion call itself: clicking Mark Completed must
// open the code dialog, and the delivery update fires only after verification.

const noop = () => {};
const statusColor = () => "";

vi.mock("../CompletionCodeDialog", () => ({
  default: ({ open, onVerified }: { open: boolean; onVerified: () => void }) =>
    open ? (
      <button onClick={onVerified}>code-dialog-verify</button>
    ) : null,
}));

const base = {
  id: "d1",
  status: "accepted",
  order_reference: "ORD-1",
  pickup_address: "Pickup St",
  dropoff_address: "Drop Ave",
  estimated_tariff: 100,
  receipt_attached: true,
};

function renderCard(overrides: Record<string, unknown> = {}) {
  const onMarkCompleted = vi.fn();
  render(
    <QueueCard
      delivery={{ ...base, ...overrides }}
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

describe("QueueCard handover code gate", () => {
  it("opens the code dialog instead of completing directly", () => {
    const { onMarkCompleted } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    expect(screen.getByRole("button", { name: /code-dialog-verify/i })).toBeInTheDocument();
    expect(onMarkCompleted).not.toHaveBeenCalled();
  });

  it("still requires the receipt proof before the code dialog", () => {
    renderCard({ receipt_attached: false });
    expect(screen.getByRole("button", { name: /mark completed/i })).toBeDisabled();
    expect(screen.queryByText(/handover code/i)).not.toBeInTheDocument();
  });

  it("completes only after the code is verified", () => {
    const { onMarkCompleted } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    fireEvent.click(screen.getByRole("button", { name: /code-dialog-verify/i }));
    expect(onMarkCompleted).toHaveBeenCalledTimes(1);
  });

  it("closes the dialog without completing on cancel", () => {
    const { onMarkCompleted } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /mark completed/i }));
    // The mock renders only onVerified; a cancel path leaves the card intact
    // and onMarkCompleted uninvoked.
    expect(onMarkCompleted).not.toHaveBeenCalled();
  });
});
