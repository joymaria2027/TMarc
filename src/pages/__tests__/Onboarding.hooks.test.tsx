import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FirstRunHint from '@/components/FirstRunHint';
import { STORAGE_KEY } from '@/lib/onboarding';

// Slice 03 contract: the hint renders only for a matching stored role,
// otherwise it renders nothing (default page copy stays untouched).
const renderHint = (audience: 'rider' | 'merchant' | 'storefront') =>
  render(
    <MemoryRouter>
      <FirstRunHint audience={audience} />
    </MemoryRouter>
  );

describe('FirstRunHint (slice 03 contract)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when no onboarding answers were stored', () => {
    const { container } = renderHint('rider');
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the rider hint on the rider surface', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ role: 'rider', zone: 'Serrekunda', detail: '' })
    );
    renderHint('rider');
    expect(screen.getByTestId('first-run-hint').textContent).toMatch(/first Offer/i);
  });

  it('stays silent on the wrong audience', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: 'customer', zone: '', detail: '' }));
    const { container } = renderHint('rider');
    expect(container).toBeEmptyDOMElement();
  });

  it('covers the storefront for customer and wholesaler roles', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: 'customer', zone: '', detail: '' }));
    const { unmount } = renderHint('storefront');
    expect(screen.getByTestId('first-run-hint').textContent).toMatch(/first Order/i);
    unmount();
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: 'wholesaler', zone: '', detail: '' }));
    renderHint('storefront');
    expect(screen.getByTestId('first-run-hint').textContent).toMatch(/application/i);
  });
});
