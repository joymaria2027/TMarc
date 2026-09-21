import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Revision 13: the product page borrows Icebug's PDP grammar — tall left
// gallery with a sticky right buy panel, a real variant radio (ours is
// STANDARD vs WHOLESALE price), mono accordion specs (DELIVERY / STOCK /
// STORE), a related-products rail from the same store, and a promise band.
// Honest-data rule: no reviews, no size guide, no fabricated imagery.

const tableData: Record<string, unknown[]> = {
  products: [
    {
      id: 'pp1', merchant_id: 'm1', name: 'Portable Phone Stand',
      description: 'Folds flat, holds tablets too.', price: 400, quantity: 60,
      track_inventory: true, available_today: true,
      approval_status: 'approved', is_active: true,
      image_path: 'stand.jpg', image_paths: ['stand.jpg', 'stand-2.jpg'],
      merchants: { id: 'm1', name: 'Tems Market', address: 'Serrekunda' },
    },
    {
      id: 'pp2', merchant_id: 'm1', name: 'Desk Organiser',
      description: null, price: 250, quantity: 12,
      track_inventory: true, available_today: true,
      approval_status: 'approved', is_active: true,
      image_path: 'desk.jpg', image_paths: null,
      merchants: { id: 'm1', name: 'Tems Market', address: 'Serrekunda' },
    },
    {
      id: 'pp3', merchant_id: 'm2', name: 'Wonjo Juice',
      description: null, price: 5, quantity: 100,
      track_inventory: false, available_today: true,
      approval_status: 'approved', is_active: true,
      image_path: 'wonjo.jpg', image_paths: null,
      merchants: { id: 'm2', name: 'kings way', address: null },
    },
  ],
};

const authState = { user: { id: 'u1' } as unknown, wholesale: false };
const { addSpy } = vi.hoisted(() => ({ addSpy: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const eqs: Record<string, unknown> = {};
      const neqs: Record<string, unknown> = {};
      const applyFilters = (rows: Array<Record<string, unknown>>) =>
        rows.filter(
          (r) =>
            Object.entries(eqs).every(([c, v]) => r[c] === v) &&
            Object.entries(neqs).every(([c, v]) => r[c] !== v)
        );
      const p = {
        select: () => p,
        eq: (c: string, v: unknown) => { eqs[c] = v; return p; },
        neq: (c: string, v: unknown) => { neqs[c] = v; return p; },
        order: () => p,
        limit: () => p,
        maybeSingle: () =>
          Promise.resolve({
            data: table === 'products' ? (applyFilters(tableData.products as Array<Record<string, unknown>>)[0] ?? null) : null,
          }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: applyFilters(tableData[table] ?? [] as Array<Record<string, unknown>>), error: null }).then(res, rej),
      };
      return p;
    },
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: authState.user, session: null, roles: [], loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), hasRole: vi.fn(() => false) }),
}));

vi.mock('@/lib/cart', () => ({
  useCart: () => ({ items: [], add: addSpy }),
}));

vi.mock('@/lib/wholesale', () => ({
  useWholesale: () => ({
    isWholesaler: authState.wholesale,
    status: authState.wholesale ? 'approved' : null,
    quote: (prod: { id: string; price: number | string }) => {
      if (!authState.wholesale) {
        return { price: Number(prod.price), retailPrice: Number(prod.price), minQty: 1, isWholesale: false };
      }
      return { price: 300, retailPrice: Number(prod.price), minQty: 5, isWholesale: true };
    },
    loading: false,
  }),
}));

vi.mock('@/lib/productImage', () => ({
  getProductPublicUrl: (path: string | null) => (path ? `https://img.test/${path}` : null),
  getProductImageUrl: async (path: string | null) => (path ? `https://img.test/${path}` : null),
}));

import ProductDetailPage from '../ProductDetailPage';

const renderPdp = (id = 'pp1') =>
  render(
    <MemoryRouter initialEntries={[`/shop/p/${id}`]}>
      <Routes>
        <Route path="/shop/p/:productId" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  authState.user = { id: 'u1' } as unknown;
  authState.wholesale = false;
  addSpy.mockClear();
});

describe('Product page Icebug translation', () => {
  it('splits into a tall gallery and a sticky buy panel with store kicker and spec accordions', async () => {
    renderPdp();
    const panel = await screen.findByRole('region', { name: /buy panel/i });
    expect(within(panel).getByRole('heading', { level: 1, name: /portable phone stand/i })).toBeInTheDocument();
    expect(within(panel).getByText('Tems Market')).toBeInTheDocument();
    // Mono accordion spec rows exist (Icebug's INSULATION / COMPARE rows).
    expect(within(panel).getByRole('button', { name: /delivery/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /stock/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /store details/i })).toBeInTheDocument();
    // Gallery region with images.
    const gallery = screen.getByRole('region', { name: /product gallery/i });
    expect(within(gallery).getAllByRole('img').length).toBeGreaterThan(0);
  });

  it('shows no variant radio for a retail buyer, and the CTA stays single-unit', async () => {
    renderPdp();
    const panel = await screen.findByRole('region', { name: /buy panel/i });
    expect(within(panel).queryByRole('radio', { name: /standard price/i })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('radio', { name: /wholesale price/i })).not.toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /add 1 portable phone stand to cart/i })).toBeInTheDocument();
  });

  it('wholesale buyer gets a STANDARD / WHOLESALE variant radio that switches price and quantity', async () => {
    authState.wholesale = true;
    renderPdp();
    const panel = await screen.findByRole('region', { name: /buy panel/i });
    const standard = within(panel).getByRole('radio', { name: /standard price/i });
    const wholesale = within(panel).getByRole('radio', { name: /wholesale price/i });
    // Wholesale is the default for eligible buyers: D300, minimum 5.
    expect(wholesale).toBeChecked();
    expect(within(panel).getByText(/minimum 5 units/i)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /add 5 portable phone stand to cart/i })).toBeInTheDocument();
    // Choosing STANDARD drops back to single-unit retail at D400.
    fireEvent.click(standard);
    expect(standard).toBeChecked();
    expect(wholesale).not.toBeChecked();
    expect(within(panel).getByRole('button', { name: /add 1 portable phone stand to cart/i })).toBeInTheDocument();
    // …and the added line is flagged retail so cart minimum validation skips it.
    fireEvent.click(within(panel).getByRole('button', { name: /add 1 portable phone stand to cart/i }));
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: 'pp1', quantity: 1, price: 400, pricingMode: 'retail' })
    );
  });

  it('delivery accordion expands with tracking and settlement copy', async () => {
    renderPdp();
    const panel = await screen.findByRole('region', { name: /buy panel/i });
    fireEvent.click(within(panel).getByRole('button', { name: /delivery/i }));
    const region = await screen.findByRole('region', { name: /delivery details/i });
    expect(region.textContent).toMatch(/gps-tracked/i);
    expect(region.textContent).toMatch(/same day/i);
  });

  it('offers more from the same store in an Icebug-style rail', async () => {
    renderPdp();
    const rail = await screen.findByRole('region', { name: /more from tems market/i });
    expect(within(rail).getByRole('link', { name: /shop all/i })).toHaveAttribute('href', '/shop/m/m1');
    const link = within(rail).getByRole('link', { name: /desk organiser/i });
    expect(link).toHaveAttribute('href', '/shop/p/pp2');
  });

  it('hides the rail when the store has no other products', async () => {
    renderPdp('pp3');
    await screen.findByRole('region', { name: /buy panel/i });
    expect(screen.queryByRole('region', { name: /more from/i })).not.toBeInTheDocument();
  });

  it('keeps the locked not-found copy', async () => {
    renderPdp('missing');
    expect(await screen.findByText(/link is out of date/i)).toBeInTheDocument();
  });
});
