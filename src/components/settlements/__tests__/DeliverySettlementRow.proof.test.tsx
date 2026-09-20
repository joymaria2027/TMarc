import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeliverySettlementRow from '../DeliverySettlementRow';
import { needsProofReview } from '@/lib/deliveries';

// Anti-abuse slice 3: money must not move silently on proof-less completions.
// needsProofReview flags delivered rows with no start (never picked up) and
// no receipt so settlement approvers (and the fraud report) can see the risk.
// Partial data never flags: unknown is not evidence.

// Table primitives render bare <tr>/<td> outside a <table> in jsdom with a
// validateDOMNesting warning only — assertions still hold.
const rowBase = {
  id: 'd1',
  order_reference: 'ORD-1',
  tariff: 100,
  merchant_id: 'm1',
  merchant_name: 'Test Store',
  settlement_approved: false,
  sharing: null,
  payment_method: null,
  payment_bank_name: null,
  pickup_address: 'Pickup St',
  dropoff_address: 'Drop Ave',
  delivered_at: '2026-09-20T10:00:00Z',
};

const propsBase = {
  canApprove: true,
  onApprove: vi.fn(),
  paymentLabel: () => null,
  payout: () => 'D0.00',
  netTariff: 100,
  expenseDeduction: 0,
  deliveryExpenses: [],
  hasExpenseDeduction: false,
};

describe('needsProofReview', () => {
  it('flags never-started, receipt-less completions', () => {
    expect(needsProofReview({ picked_up_at: null, receipt_attached: false })).toBe(true);
  });

  it('clears started runs', () => {
    expect(
      needsProofReview({ picked_up_at: '2026-09-20T09:00:00Z', receipt_attached: false }),
    ).toBe(false);
  });

  it('clears receipt-backed completions', () => {
    expect(needsProofReview({ picked_up_at: null, receipt_attached: true })).toBe(false);
  });

  it('never flags on partial data (unknown is not evidence)', () => {
    expect(needsProofReview({})).toBe(false);
    expect(needsProofReview({ picked_up_at: null })).toBe(false);
  });
});

describe('DeliverySettlementRow proof badge', () => {
  it('warns approvers on proof-less, unapproved rows', () => {
    render(
      <DeliverySettlementRow
        {...propsBase}
        delivery={{ ...rowBase, picked_up_at: null, receipt_attached: false }}
      />,
    );
    expect(screen.getByText(/no start proof/i)).toBeInTheDocument();
  });

  it('stays quiet once approved or proven', () => {
    const { rerender } = render(
      <DeliverySettlementRow
        {...propsBase}
        delivery={{ ...rowBase, picked_up_at: null, receipt_attached: false, settlement_approved: true }}
      />,
    );
    expect(screen.queryByText(/no start proof/i)).toBeNull();
    rerender(
      <DeliverySettlementRow
        {...propsBase}
        delivery={{
          ...rowBase,
          picked_up_at: '2026-09-20T09:00:00Z',
          receipt_attached: false,
        }}
      />,
    );
    expect(screen.queryByText(/no start proof/i)).toBeNull();
  });
});
