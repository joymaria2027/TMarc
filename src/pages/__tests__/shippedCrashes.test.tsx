import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Regression net for the three crashes that shipped to production. All three
// were already visible to the TypeScript compiler / rules-of-hooks, but the
// repo had no working typecheck gate (see plan 002).
//
//  1. AdminDashboard called `toast.error` with no `sonner` import -> ReferenceError.
//  2. MerchantsPage imported `useNavigate` but never called it, so the
//     "Create Delivery" handler referenced a free `navigate` -> ReferenceError.
//  3. ProductApprovalsPage early-returned for non-admins *before* two `useMemo`
//     calls. `useAuth` resolves roles asynchronously, so `hasRole("admin")` is
//     false on first paint and true on a later one -> "Rendered more hooks than
//     during the previous render" -> blank page for every admin.

const navigateSpy = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));

// Mutable auth state so case 3 can drive a false -> true role transition across
// two renders of the *same* mounted tree.
const auth: { user: { id: string } | null; roles: string[]; rolesReady: boolean } = {
  user: { id: 'u1' },
  roles: ['admin'],
  rolesReady: true,
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: auth.user,
    roles: auth.roles,
    rolesReady: auth.rolesReady,
    hasRole: (r: string) => auth.roles.includes(r),
  }),
}));

const tableData: Record<string, unknown[]> = {};
let writeError: { message: string } | null = null;

// One chainable object per `from(table)`. Read chains resolve to the table's
// rows; `update()`/`insert()` switch it into write mode, which resolves to
// `writeError` so a page's error branch can be exercised on demand.
const supabaseFrom = (table: string) => {
  const rows = (tableData[table] ?? []) as unknown[];
  let isWrite = false;
  const read = () => Promise.resolve({ data: rows, error: null });
  const write = () => Promise.resolve({ data: null, error: writeError });
  const run = () => (isWrite ? write() : read());
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: () => api,
    in: () => api,
    gte: () => api,
    lte: () => api,
    is: () => api,
    update: () => { isWrite = true; return api; },
    insert: () => { isWrite = true; return api; },
    upsert: () => { isWrite = true; return api; },
    delete: () => { isWrite = true; return api; },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (res: unknown, rej: unknown) => run().then(res as never, rej as never),
    catch: (rej: unknown) => run().catch(rej as never),
    finally: (f: unknown) => run().finally(f as never),
  };
  return api;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => supabaseFrom(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
    channel: () => {
      const ch: Record<string, unknown> = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: () => {},
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

beforeEach(() => {
  navigateSpy.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  writeError = null;
  for (const key of Object.keys(tableData)) delete tableData[key];
  auth.user = { id: 'u1' };
  auth.roles = ['admin'];
  auth.rolesReady = true;
});

describe('AdminDashboard mark-notification-read', () => {
  it('surfaces the write error instead of throwing ReferenceError', async () => {
    tableData.tariff_notifications = [
      { id: 'n1', message: 'Tariff updated', created_at: new Date().toISOString(), read_by: [] },
    ];
    writeError = { message: 'network down' };

    const AdminDashboard = (await import('@/pages/AdminDashboard.tsx')).default;
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

    const readButton = await screen.findByRole('button', { name: 'Read' });
    fireEvent.click(readButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('network down'));
  });
});

describe('MerchantsPage create-delivery', () => {
  it('binds useNavigate and routes to the new-delivery page', async () => {
    tableData.merchants = [
      { id: 'm1', name: 'Acme Foods', address: '1 Test Road', is_active: true, approval_status: 'approved' },
    ];

    const MerchantsPage = (await import('@/pages/MerchantsPage.tsx')).default;
    render(<MemoryRouter><MerchantsPage /></MemoryRouter>);

    const createDelivery = await screen.findByRole('button', { name: /Create Delivery/i });
    expect(() => fireEvent.click(createDelivery)).not.toThrow();
    expect(navigateSpy).toHaveBeenCalledWith('/deliveries/new?merchant=m1');
  });
});

describe('ProductApprovalsPage role transition', () => {
  // Two passes are the whole point: a single-pass render would pass even with
  // the hook-order bug, because `hasRole("admin")` is only false on first paint.
  it('survives rolesReady false -> true without unmounting the tree', async () => {
    auth.roles = [];
    auth.rolesReady = false;

    const ProductApprovalsPage = (await import('@/pages/ProductApprovalsPage.tsx')).default;
    const { rerender } = render(<ProductApprovalsPage />);

    // Roles resolve: same component, same hook order, admin markup now allowed.
    auth.roles = ['admin'];
    auth.rolesReady = true;
    expect(() => rerender(<ProductApprovalsPage />)).not.toThrow();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Product Approvals/i })).toBeInTheDocument()
    );
  });

  it('still shows the non-admin shell for a resolved non-admin', async () => {
    auth.roles = ['rider'];
    auth.rolesReady = true;

    const ProductApprovalsPage = (await import('@/pages/ProductApprovalsPage.tsx')).default;
    render(<ProductApprovalsPage />);

    expect(await screen.findByText('Admin access required.')).toBeInTheDocument();
  });
});
