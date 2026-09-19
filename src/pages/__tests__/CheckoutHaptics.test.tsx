import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from '../CheckoutPage';

/**
 * Key-moment haptics (issue: haptics-key-moments/01).
 *
 * Press acknowledgement (light impact) at submit; success notification when
 * orders are placed; error notification only on full failure — partial
 * failures stay silent (the error toast + navigation is enough).
 */

const hapticSpies = vi.hoisted(() => ({
  impact: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  selectionChanged: vi.fn(),
}));

vi.mock('@/lib/haptics', () => ({
  haptics: hapticSpies,
}));

const { authState, fromSpy } = vi.hoisted(() => ({
  authState: {
    user: null as unknown,
    loading: false,
  },
  fromSpy: vi.fn(),
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

// Stable identities required: CheckoutPage's wholesale-violations effect
// depends on `items`/`quote` — fresh identities per render loop setState
// forever (OOM). See public-routes-content-first issue comments.
const stableItem = { product_id: 'p1', merchant_id: 'm1', merchant_name: 'Test Store', name: 'Test Item', price: 100, quantity: 2 };
const stableItems = [stableItem];
const stableGroups = { m1: stableItems };
const stableQuote = () => ({ isWholesale: false, minQty: 1, price: 100 });

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
  useWholesale: () => ({ isWholesaler: false, quote: stableQuote }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderCheckout = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <CheckoutPage />
    </MemoryRouter>
  );

/** Chainable thenable builder: supports .select().single(), .insert().select().single(), awaits. */
function chain(steps: Array<{ data: unknown; error: unknown }>) {
  let i = 0;
  const next = () => steps[Math.min(i, steps.length - 1)];
  const q: Record<string, unknown> = {};
  const settle = () => {
    const s = next();
    i += 1;
    return Promise.resolve({ data: s.data, error: s.error });
  };
  Object.assign(q, {
    then: (onFul?: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) => settle().then(onFul, onRej),
    catch: (onRej?: (e: unknown) => unknown) => settle().catch(onRej),
    finally: (onFin?: () => void) => settle().finally(onFin),
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    single: () => settle(),
    maybeSingle: () => settle(),
    insert: () => q,
    update: () => q,
  });
  return q;
}

/** Chain that inserts orders/items successfully and starts payment. */
function mockHappyPath() {
  let call = 0;
  fromSpy.mockImplementation((table: string) => {
    if (table === 'customers') return chain([{ data: { id: 'c1' }, error: null }]);
    if (table === 'orders') {
      call += 1;
      return chain([{ data: { id: `o${call}` }, error: null }]);
    }
    return chain([{ data: [], error: null }]);
  });
}

beforeEach(() => {
  fromSpy.mockReset();
  fromSpy.mockImplementation(() => chain([{ data: [], error: null }]));
  for (const s of Object.values(hapticSpies)) s.mockClear();
  authState.user = { id: 'u1' };
  authState.loading = false;
});

/** Fill the required fields so validation passes and submit reaches the DB path. */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Fatou Jallow' } });
  fireEvent.change(screen.getByLabelText(/^phone/i), { target: { value: '2207712345' } });
  fireEvent.change(screen.getByLabelText(/delivery address/i), { target: { value: '12 Serrekunda Lane' } });
}

describe('CheckoutPage haptics (haptics-key-moments/01)', () => {
  it('acknowledges the press with a light impact immediately at submit', async () => {
    mockHappyPath();
    renderCheckout();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /pay .* with modempay/i }));

    // Press ack fires synchronously at click — before any await settles.
    expect(hapticSpies.impact).toHaveBeenCalledWith('LIGHT');

    await waitFor(() => expect(hapticSpies.success).toHaveBeenCalled());
    // Exactly one ack per press (no double-fire on success/error paths).
    expect(hapticSpies.impact).toHaveBeenCalledTimes(1);
  });

  it('fires a success notification when orders are placed', async () => {
    mockHappyPath();
    renderCheckout();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /pay .* with modempay/i }));

    await waitFor(() => expect(hapticSpies.success).toHaveBeenCalled());
    expect(hapticSpies.error).not.toHaveBeenCalled();
  });

  it('fires an error notification only on full failure — silent on partial failure', async () => {
    // Every order insert fails: nothing created → full failure.
    fromSpy.mockImplementation((table: string) => {
      if (table === 'customers') return chain([{ data: { id: 'c1' }, error: null }]);
      if (table === 'orders') return chain([{ data: null, error: new Error('insert failed') }]);
      return chain([{ data: [], error: null }]);
    });
    renderCheckout();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: /pay .* with modempay/i }));

    await waitFor(() => expect(hapticSpies.error).toHaveBeenCalled());
    expect(hapticSpies.success).not.toHaveBeenCalled();
  });
});
