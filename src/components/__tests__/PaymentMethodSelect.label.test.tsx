import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaymentMethodSelect from '../PaymentMethodSelect';

// Ticket: cards show a stray "undefined" under the payment area when the saved
// method isn't a known value (e.g. legacy display names like "QMoney" stored
// raw). The lookup miss must fall back to the saved value, never render
// "undefined". Case variants of known values resolve to the canonical label.

describe('PaymentMethodSelect label fallback', () => {
  it('renders the canonical label for known values', () => {
    render(
      <PaymentMethodSelect deliveryId="d1" orderReference="R1" userId="u1" currentMethod="wave" />,
    );
    expect(screen.getByText('Wave')).toBeInTheDocument();
  });

  it('resolves case variants of known values', () => {
    render(
      <PaymentMethodSelect deliveryId="d1" orderReference="R1" userId="u1" currentMethod="QMoney" />,
    );
    expect(screen.getByText('QMoney')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('falls back to the saved value for legacy/unknown methods', () => {
    render(
      <PaymentMethodSelect deliveryId="d1" orderReference="R1" userId="u1" currentMethod="OMoney" />,
    );
    expect(screen.getByText('OMoney')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('keeps the bank-transfer name suffix working', () => {
    render(
      <PaymentMethodSelect
        deliveryId="d1"
        orderReference="R1"
        userId="u1"
        currentMethod="bank_transfer"
        currentBankName="GTBank"
      />,
    );
    expect(screen.getByText('Bank Transfer (GTBank)')).toBeInTheDocument();
  });

  it('shows the setter button when no method is saved', () => {
    render(<PaymentMethodSelect deliveryId="d1" orderReference="R1" userId="u1" />);
    expect(screen.getByRole('button', { name: /set payment method/i })).toBeInTheDocument();
  });
});
