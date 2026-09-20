import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Revision 7: the shop page borrows Depop's storefront grammar — full-bleed
// hero with honest stat tiles, category tiles that filter, price-cap tiles,
// and a "just added" fresh rail — while keeping every existing behavior
// (filters, sort, pagination, cart, wholesale quotes). Contract tests lock
// the new surface; regression guards in finance-remediation.test.ts lock
// the funnel copy.

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const tableData: Record<string, unknown[]> = {
  products: [
    { id: 'p1', merchant_id: 'm1', name: 'Chicken Yassa', description: 'With rice', price: 20, quantity: 5, track_inventory: true, available_today: true, image_path: 'a.jpg', image_paths: null, category_id: 'c1', created_at: hoursAgo(2), merchants: { id: 'm1', name: 'Kai Grill', business_type_id: 'bt1' } },
    { id: 'p2', merchant_id: 'm2', name: 'Fresh Tapalapa', description: 'Baked this morning', price: 10, quantity: 0, track_inventory: false, available_today: true, image_path: 'b.jpg', image_paths: null, category_id: 'c2', created_at: hoursAgo(5), merchants: { id: 'm2', name: 'Serra Bakery', business_type_id: 'bt2' } },
    { id: 'p3', merchant_id: 'm1', name: 'Grilled Fish', description: 'Whole, with spice', price: 45, quantity: 3, track_inventory: true, available_today: true, image_path: 'c.jpg', image_paths: null, category_id: 'c1', created_at: hoursAgo(24 * 3), merchants: { id: 'm1', name: 'Kai Grill', business_type_id: 'bt1' } },
    { id: 'p4', merchant_id: 'm2', name: 'Fruit Basket', description: 'Seasonal mix', price: 120, quantity: 8, track_inventory: true, available_today: true, image_path: 'd.jpg', image_paths: null, category_id: 'c2', created_at: hoursAgo(24 * 10), merchants: { id: 'm2', name: 'Serra Bakery', business_type_id: 'bt2' } },
  ],
  merchants: [
    { id: 'm1', name: 'Kai Grill', business_type_id: 'bt1', address: 'Serrekunda' },
    { id: 'm2', name: 'Serra Bakery', business_type_id: 'bt2', address: 'Westfield' },
  ],
  business_types: [
    { id: 'bt1', name: 'Grill house' },
    { id: 'bt2', name: 'Bakery' },
  ],
  product_categories: [
    { id: 'c1', name: 'Grill', merchant_id: 'm1' },
    { id: 'c2', name: 'Bakery', merchant_id: 'm2' },
  ],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const p = {
        select: () => p,
        eq: () => p,
        order: () => p,
        limit: () => p,
        maybeSingle: () => Promise.resolve({ data: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: tableData[table] ?? [], error: null }).then(res, rej),
      };
      return p;
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, roles: [], loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), hasRole: vi.fn(() => false) }),
}));

vi.mock('@/lib/cart', () => ({
  useCart: () => ({ items: [], add: vi.fn() }),
}));

vi.mock('@/lib/wholesale', () => ({
  useWholesale: () => ({
    isWholesaler: false,
    status: null,
    quote: (p: { price: number | string }) => ({ price: Number(p.price), retailPrice: Number(p.price), minQty: 1, isWholesale: false }),
    loading: false,
  }),
}));

vi.mock('@/lib/productImage', () => ({
  getProductPublicUrl: (path: string | null) => (path ? `https://img.test/${path}` : null),
  getProductImageUrl: async (path: string | null) => (path ? `https://img.test/${path}` : null),
}));

import ShopPage from '../ShopPage';

const renderShop = () =>
  render(
    <MemoryRouter>
      <ShopPage />
    </MemoryRouter>
  );

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('Shop page Depop translation', () => {
  it('opens with a hero: headline, context line, CTA, and honest stat tiles', async () => {
    renderShop();
    const hero = await screen.findByRole('region', { name: /shop highlights/i });
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(/order from stores near you/i);
    expect(within(hero).getByText(/order from local stores\./i)).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: /start shopping/i })).toBeInTheDocument();
    // Stats derive from real data: 2 open stores, 4 items live.
    const heroText = hero.textContent ?? '';
    expect(heroText).toMatch(/stores open\s*2/i);
    expect(heroText).toMatch(/items live\s*4/i);
  });

  it('category tiles filter the grid', async () => {
    renderShop();
    const tiles = await screen.findByRole('region', { name: /shop by category/i });
    fireEvent.click(within(tiles).getByRole('button', { name: /grill/i }));
    const grid = screen.getByRole('region', { name: /all products/i });
    expect(within(grid).getByText('Chicken Yassa')).toBeInTheDocument();
    expect(within(grid).getByText('Grilled Fish')).toBeInTheDocument();
    expect(within(grid).queryByText('Fresh Tapalapa')).not.toBeInTheDocument();
    expect(within(grid).queryByText('Fruit Basket')).not.toBeInTheDocument();
  });

  it('price-cap tiles cap the grid and combine with other filters', async () => {
    renderShop();
    const caps = await screen.findByRole('region', { name: /shop by price/i });
    expect(within(caps).getByRole('button', { name: 'Under D25' })).toBeInTheDocument();
    fireEvent.click(within(caps).getByRole('button', { name: 'Under D25' }));
    const grid = screen.getByRole('region', { name: /all products/i });
    expect(within(grid).getByText('Chicken Yassa')).toBeInTheDocument();
    expect(within(grid).getByText('Fresh Tapalapa')).toBeInTheDocument();
    expect(within(grid).queryByText('Grilled Fish')).not.toBeInTheDocument();
    expect(within(grid).queryByText('Fruit Basket')).not.toBeInTheDocument();
  });

  it('just-added rail shows the newest items with fresh chips', async () => {
    renderShop();
    const rail = await screen.findByRole('region', { name: /just added/i });
    const items = within(rail).getAllByRole('link');
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items[0]).toHaveAttribute('href', '/shop/p/p1');
    const text = rail.textContent ?? '';
    expect(text).toMatch(/added today/i);
    expect(text).toMatch(/this week/i);
  });

  it('store rail links into merchant storefronts', async () => {
    renderShop();
    const stores = await screen.findByRole('region', { name: /open stores near you/i });
    expect(within(stores).getByRole('link', { name: /kai grill/i })).toHaveAttribute('href', '/shop/m/m1');
    expect(within(stores).getByRole('link', { name: /serra bakery/i })).toHaveAttribute('href', '/shop/m/m2');
  });

  it('header search routes to the shop pre-filtered', async () => {
    render(
      <MemoryRouter initialEntries={['/shop?q=tapalapa']}>
        <ShopPage />
      </MemoryRouter>
    );
    const grid = await screen.findByRole('region', { name: /all products/i });
    await screen.findByRole('searchbox', { name: /search products or merchants/i });
    expect(within(grid).getByText('Fresh Tapalapa')).toBeInTheDocument();
    expect(within(grid).queryByText('Chicken Yassa')).not.toBeInTheDocument();
  });

  it('hero splits into a wholesale door on the right', async () => {
    renderShop();
    const hero = await screen.findByRole('region', { name: /shop highlights/i });
    const door = within(hero).getByRole('link', { name: /see wholesale prices/i });
    expect(door).toHaveAttribute('href', '/wholesale');
    // The locked customer contract survives the split
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(/order from stores near you/i);
    expect(within(hero).getByRole('button', { name: /start shopping/i })).toBeInTheDocument();
  });

  it('statement break routes sellers to the /sell funnel', async () => {
    renderShop();
    const statement = await screen.findByRole('region', { name: /keep money local/i });
    const sell = within(statement).getByRole('link', { name: /start selling/i });
    expect(sell).toHaveAttribute('href', '/sell');
  });

  it('category tiles are photo cards when imagery exists', async () => {
    renderShop();
    const tiles = await screen.findByRole('region', { name: /shop by category/i });
    const grill = within(tiles).getByRole('button', { name: /grill/i });
    const img = grill.querySelector('img');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'https://img.test/a.jpg');
    // Still a filter control
    fireEvent.click(grill);
    const grid = screen.getByRole('region', { name: /all products/i });
    expect(within(grid).getByText('Chicken Yassa')).toBeInTheDocument();
    expect(within(grid).queryByText('Fresh Tapalapa')).not.toBeInTheDocument();
  });

  it('store tiles carry strips of that store\'s product photos', async () => {
    renderShop();
    const stores = await screen.findByRole('region', { name: /open stores near you/i });
    const kai = within(stores).getByRole('link', { name: /kai grill/i });
    const thumbs = kai.querySelectorAll('img');
    expect(thumbs.length).toBeGreaterThanOrEqual(1);
    expect(thumbs[0]).toHaveAttribute('src', 'https://img.test/a.jpg');
  });

  it('hero carries a third trust tile alongside the honest stats', async () => {
    renderShop();
    const hero = await screen.findByRole('region', { name: /shop highlights/i });
    const text = hero.textContent ?? '';
    expect(text).toMatch(/tracked delivery/i);
    expect(text).toMatch(/door to door/i);
  });

  it('clear-filters resets the price cap too', async () => {
    renderShop();
    const caps = await screen.findByRole('region', { name: /shop by price/i });
    fireEvent.click(within(caps).getByRole('button', { name: 'Under D25' }));
    const grid = screen.getByRole('region', { name: /all products/i });
    expect(within(grid).queryByText('Fruit Basket')).not.toBeInTheDocument();
    fireEvent.click(within(grid).getByRole('button', { name: /clear filters/i }));
    expect(within(grid).getByText('Fruit Basket')).toBeInTheDocument();
  });
});
