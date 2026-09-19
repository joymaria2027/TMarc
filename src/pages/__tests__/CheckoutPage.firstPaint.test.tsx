import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from '../CheckoutPage';

/**
 * Content-first cold start for /checkout (issue: public-routes-content-first/01).
 *
 * The page is anonymous-first by design (inline account card + gate at submit),
 * so a pending session must render the same UI as a signed-out visitor — never
 * the full-page "Loading checkout" skeleton that used to gate first paint.
 */

const { authState, fromSpy, cartState, wholesaleState } = vi.hoisted(() => ({
  authState: {
    user: null as unknown,
    loading: true,
  },
  fromSpy: vi.fn(),
  // Stable identities: CheckoutPage effects depend on `items`/`quote`, so new
  // array/function identities per render would loop setState → render forever.
  cartState: {
    item: { product_id: 'p1', merchant_id: 'm1', merchant_name: 'Test Store', name: 'Test Item', price: 100, quantity: 2 },
  },
  wholesaleState: {
    quote: () => ({ isWholesale: false, minQty: 1, price: 100 }),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    roles: [],
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: vi.fn(() => false),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromSpy,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

// Stable container identities too: CheckoutPage's wholesale-violations effect
// depends on `items` — a fresh array per render would loop setState forever.
const stableItems = [cartState.item];
const stableGroups = { m1: stableItems };

vi.mock('@/lib/cart', () => ({
  useCart: () => ({
    items: stableItems,
    groups: stableGroups,
    subtotal: 200,
    add: vi.fn(),
    remove: vi.fn(),
    setQty: vi.fn(),
    clear: vi.fn(),
    removeMerchant: vi.fn(),
  }),
}));

vi.mock('@/lib/wholesale', () => ({
  useWholesale: () => ({ isWholesaler: false, quote: wholesaleState.quote }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';

const renderCheckout = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <CheckoutPage />
    </MemoryRouter>
  );

beforeEach(() => {
  fromSpy.mockReset();
  // Post-mount effects (delivery fee lookup) legitimately read tariffs; give
  // them an empty resolved chain. Order creation must never be touched.
  fromSpy.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    const self = Promise.resolve({ data: [], error: null });
    Object.assign(q, {
      then: self.then.bind(self),
      catch: self.catch.bind(self),
      finally: (self as Promise<unknown>).finally.bind(self),
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      insert: () => q,
      update: () => q,
    });
    return q;
  });
  (toast.error as ReturnType<typeof vi.fn>).mockClear();
  (toast.success as ReturnType<typeof vi.fn>).mockClear();
  authState.user = null;
  authState.loading = true;
});

describe('CheckoutPage content-first first paint (public-routes-content-first/01)', () => {
  it('renders checkout content while the session is still loading', () => {
    renderCheckout();

    expect(screen.getByRole('heading', { name: /^checkout$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByText(/create an account or sign in to place your order/i)).toBeInTheDocument();
    // The old blocking gate rendered this exact skeleton label — never again.
    expect(screen.queryByLabelText(/loading checkout/i)).toBeNull();
  });

  it('does not touch order-creation tables when submit is pressed before the session resolves', () => {
    renderCheckout();

    const payButton = screen.getByRole('button', { name: /create an account or sign in to continue/i });
    fireEvent.click(payButton);

    expect(fromSpy).not.toHaveBeenCalledWith('orders');
    expect(fromSpy).not.toHaveBeenCalledWith('customers');
    expect(toast.error).toHaveBeenCalled();
  });

  it('renders the same anonymous UI once the session resolves as signed-out', () => {
    authState.loading = false;
    renderCheckout();

    expect(screen.getByRole('heading', { name: /^checkout$/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/loading checkout/i)).toBeNull();
  });
});
