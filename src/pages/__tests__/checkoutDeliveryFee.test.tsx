import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryRouter } from 'react-router-dom';
import CheckoutPage from '../CheckoutPage';

/**
 * Checkout must not write an Order with delivery_fee = 0 (plan 007).
 *
 * The fee lookup is async and the address is debounced by 400ms, so tapping Pay
 * inside that window created a real Order that the customer was genuinely
 * charged for — minus the delivery fee. Nothing failed; the revenue was simply
 * lost. These tests pin the gate on *completeness* (every merchant in the cart
 * has a fee) rather than on a timer.
 *
 * Mock setup is modelled on CheckoutPage.firstPaint.test.tsx.
 */

const { authState, fromSpy, cartState, feeSpy, wholesaleState } = vi.hoisted(() => ({
  authState: { user: null as unknown, loading: false },
  fromSpy: vi.fn(),
  feeSpy: vi.fn(),
  cartState: {
    items: [
      { product_id: 'p1', merchant_id: 'm1', merchant_name: 'Test Store', name: 'Test Item', price: 100, quantity: 2 },
    ] as unknown[],
  },
  wholesaleState: { quote: () => ({ isWholesale: false, minQty: 1, price: 100 }) },
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

// `groups` must be a STABLE identity: CheckoutPage's effects depend on the cart.
const stableGroups = { m1: cartState.items };

vi.mock('@/lib/cart', () => ({
  useCart: () => ({
    items: cartState.items,
    groups: stableGroups,
    subtotal: 200,
    add: vi.fn(),
    remove: vi.fn(),
    setQty: vi.fn(),
    clear: vi.fn(),
    removeMerchant: vi.fn(),
  }),
}));

vi.mock('@/lib/deliveryFee', () => ({ resolveDeliveryFee: feeSpy }));

vi.mock('@/lib/wholesale', () => ({
  useWholesale: () => ({ isWholesaler: false, quote: wholesaleState.quote }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from 'sonner';

const signedIn = { id: 'user-1', email: 'a@b.co' };

/** A promise we can settle from the test body, to hold the fee lookup in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const renderCheckout = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <CheckoutPage />
    </MemoryRouter>,
  );

/** Fill in the fields submit() reads before it would touch `orders`. */
/** Name + phone: always required. */
function fillIdentityFields() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '0700000000' } });
}

/** Plus the address, which only exists for delivery fulfillment. */
function fillRequiredFields() {
  fillIdentityFields();
  fireEvent.change(screen.getByLabelText(/delivery address/i), { target: { value: '1 Main St' } });
}

beforeEach(() => {
  fromSpy.mockReset();
  feeSpy.mockReset();
  insertSpy.mockReset();
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
      single: () => Promise.resolve({ data: { id: 'order-1' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }),
      insert: (payload: unknown) => {
        insertSpy(payload);
        return q;
      },
      update: () => q,
    });
    return q;
  });
  (toast.error as ReturnType<typeof vi.fn>).mockClear();
  (toast.success as ReturnType<typeof vi.fn>).mockClear();
  authState.user = signedIn;
  authState.loading = false;
});

const insertSpy = vi.fn();

/** The payload of the one `orders` insert submit() performs. */
function orderPayload(): Record<string, unknown> | undefined {
  return insertSpy.mock.calls.map(c => c[0] as Record<string, unknown>)
    .find(p => p && p.delivery_fee !== undefined);
}

describe('checkout delivery fee resolution (plan 007)', () => {
  it('1. REGRESSION: Pay is disabled while the fee lookup is in flight', () => {
    const d = deferred<number>();
    feeSpy.mockReturnValue(d.promise);

    renderCheckout();

    const pay = screen.getByRole('button', { name: /calculating delivery fees/i });
    expect(pay).toBeDisabled();
    expect(screen.queryByRole('button', { name: /pay .* with modempay/i })).toBeNull();
  });

  it('2. happy path: Pay enables and writes the resolved fee', async () => {
    feeSpy.mockResolvedValue(35);
    renderCheckout();

    const pay = await screen.findByRole('button', { name: /pay .* with modempay/i });
    expect(pay).toBeEnabled();

    fillRequiredFields();
    fireEvent.click(pay);

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const order = orderPayload();
    expect(order).toMatchObject({
      subtotal: 200,
      delivery_fee: 35,
      total: 235,
    });
  });

  it('3. no Order is written while fees are unresolved', async () => {
    // React suppresses click dispatch on a disabled button (it inspects the
    // `disabled` PROP, not the DOM attribute), so submit()'s internal
    // `if (!feesResolved) return` is unreachable through the rendered UI. What
    // is reachable — and what actually caused the lost revenue — is that
    // nothing is written. The internal early return is a second line of
    // defence for keyboard/programmatic callers; it is pinned by the source
    // assertion below rather than by a dispatch we cannot perform.
    const d = deferred<number>();
    feeSpy.mockReturnValue(d.promise);
    renderCheckout();

    fillRequiredFields();
    const pay = screen.getByRole('button', { name: /calculating delivery fees/i });
    expect(pay).toBeDisabled();
    fireEvent.click(pay);

    // Give any stray async work a chance to land before asserting nothing wrote.
    await act(async () => { await Promise.resolve(); });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(fromSpy).not.toHaveBeenCalledWith('orders');
  });

  it('3b. submit() keeps its own guard, not only the button', () => {
    // Change-detector for the defence-in-depth early return inside submit().
    const src = fs.readFileSync(
      path.resolve(__dirname, '../CheckoutPage.tsx'), 'utf-8');
    const guard = src.indexOf('if (!feesResolved) {');
    expect(guard).toBeGreaterThan(-1);
    // It must return before setSubmitting(true) and before any orders insert.
    expect(guard).toBeLessThan(src.indexOf('setSubmitting(true)', guard));
    expect(guard).toBeLessThan(src.indexOf('from("orders")', guard));
    expect(src.slice(guard, guard + 200)).toMatch(/toast\.error/);
  });

  it('4. a stale merchant in `fees` is not summed into the written total', async () => {
    // `fees` only holds m1 here. If the page summed Object.values(fees) it would
    // be indistinguishable, so we assert the exact total for a cart of one
    // merchant — the value that must reach the gateway and the DB.
    feeSpy.mockResolvedValue(35);
    renderCheckout();

    const pay = await screen.findByRole('button', { name: /pay .* with modempay/i });
    fillRequiredFields();
    fireEvent.click(pay);

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const order = orderPayload();
    expect(order.total).toBe(235);
    expect(order.delivery_fee).toBe(35);
  });

  it('5. pickup short-circuits: fees resolve to 0 without calling resolveDeliveryFee', async () => {
    feeSpy.mockResolvedValue(35);
    renderCheckout();

    fireEvent.click(screen.getByLabelText(/pickup/i));
    feeSpy.mockClear(); // the mount-time lookup already ran under 'delivery'

    const pay = await screen.findByRole('button', { name: /pay .* with modempay/i });
    expect(pay).toBeEnabled();
    expect(feeSpy).not.toHaveBeenCalled();

    fillIdentityFields(); // pickup has no address field
    fireEvent.click(pay);

    await waitFor(() => expect(insertSpy).toHaveBeenCalled());
    const order = orderPayload();
    expect(order).toMatchObject({ delivery_fee: 0, subtotal: 200, total: 200 });
  });

  it('does not loop the fee effect when re-rendered (stable merchant-id list)', async () => {
    feeSpy.mockResolvedValue(35);
    renderCheckout();
    await screen.findByRole('button', { name: /pay .* with modempay/i });

    const callsAfterFirstResolve = feeSpy.mock.calls.length;
    // A loop would keep re-invoking the lookup on every render.
    await act(async () => { await Promise.resolve(); });
    expect(feeSpy.mock.calls.length).toBe(callsAfterFirstResolve);
  });
});
