import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Regression: the tariff-zone dropdown was always empty on the new-delivery
// form. The page queried `from('tariffs')` — a table that exists in no
// migration — so PostgREST 404'd and `tariffs` stayed []. The zone feed a
// delivery's estimated_tariff comes from, so the form could not be completed.
//
// Fixed by querying `merchant_tariffs`, which carries the same columns and
// FKs to merchants.id. This test exists because that fix changed behaviour, not
// just types: it asserts the real query happens and the zones actually render.

const tablesQueried: { table: string; eqs: Record<string, unknown> }[] = [];

const rows: Record<string, unknown[]> = {
  merchants: [{ id: 'm1', name: 'Acme Foods', address: '1 Test Road', latitude: null, longitude: null }],
  merchant_tariffs: [
    { id: 't1', location_name: 'Bakau', tariff_amount: 40 },
    { id: 't2', location_name: 'Coxos', tariff_amount: 55 },
  ],
  merchant_riders: [],
};

const makeQuery = (table: string) => {
  const eqs: Record<string, unknown> = {};
  const data = rows[table] ?? [];
  const single = Promise.resolve({ data: data[0] ?? null, error: null });
  const many = Promise.resolve({ data, error: null });
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => api,
    limit: () => api,
    in: () => api,
    is: () => api,
    eq: (c: string, v: unknown) => { eqs[c] = v; return api; },
    maybeSingle: () => single,
    single: () => single,
    then: (res: unknown, rej: unknown) => many.then(res as never, rej as never),
  };
  tablesQueried.push({ table, eqs });
  return api;
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, roles: ['admin'], rolesReady: true, hasRole: () => true }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeQuery(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
    channel: () => { const ch: Record<string, unknown> = { on: () => ch, subscribe: () => ch }; return ch; },
    removeChannel: () => {},
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  tablesQueried.length = 0;
});

// jsdom implements no scrollIntoView; radix's Select calls it when the popup
// opens. Same shim as DeliveriesTable.test.tsx / orderChatMirror.test.tsx.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const renderForm = async () => {
  const NewDeliveryPage = (await import('@/pages/NewDeliveryPage')).default;
  return render(
    <MemoryRouter initialEntries={['/deliveries/new?merchant=m1']}>
      <Routes>
        <Route path="/deliveries/new" element={<NewDeliveryPage />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('NewDeliveryPage tariff zones', () => {
  it('reads merchant_tariffs for the requested merchant, not a nonexistent table', async () => {
    await renderForm();

    await waitFor(() =>
      expect(tablesQueried.some((q) => q.table === 'merchant_tariffs')).toBe(true),
    );

    const tariffQuery = tablesQueried.find((q) => q.table === 'merchant_tariffs')!;
    expect(tariffQuery.eqs.merchant_id).toBe('m1');

    // The original bug, asserted directly: nothing should query `tariffs`.
    expect(tablesQueried.some((q) => q.table === 'tariffs')).toBe(false);
  });

  it('populates the zone dropdown from those rows', async () => {
    await renderForm();

    // Opening a shadcn Select renders its items in a portal; clicking the
    // trigger is what a user does, so drive it the same way.
    const trigger = await screen.findByLabelText('Tariff zone *');
    trigger.click();

    await waitFor(() => expect(screen.getByText(/Bakau/)).toBeInTheDocument());
    expect(screen.getByText(/Coxos/)).toBeInTheDocument();
  });
});