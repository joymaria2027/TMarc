import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Revision 12: Depop's Sell page translated. Sellers get persuaded before the
// auth wall: outcome hero, honest trust tiles, three simple steps, and real
// stores as proof. No invented sellers, no fake phone screenshots.

const railState = vi.hoisted(() => ({
  products: [
    { id: 'p1', merchant_id: 'm1', name: 'Chicken Yassa', price: 20, image_path: 'a.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString(), merchants: { id: 'm1', name: 'Kai Grill' } },
    { id: 'p2', merchant_id: 'm2', name: 'Fresh Tapalapa', price: 10, image_path: 'b.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString(), merchants: { id: 'm2', name: 'Serra Bakery' } },
  ] as Array<Record<string, unknown>>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const p = {
        select: () => p,
        eq: () => p,
        order: () => p,
        limit: () => p,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: table === 'products' ? railState.products : table === 'merchants' ? [
            { id: 'm1', name: 'Kai Grill', business_type_id: 'bt1', address: 'Serrekunda' },
            { id: 'm2', name: 'Serra Bakery', business_type_id: 'bt2', address: 'Westfield' },
          ] : [], error: null }).then(res, rej),
      };
      return p;
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, session: null, roles: [], loading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), hasRole: vi.fn(() => false) }),
}));

vi.mock('@/lib/cart', () => ({ useCart: () => ({ items: [], add: vi.fn() }) }));

vi.mock('@/lib/wholesale', () => ({
  useWholesale: () => ({ isWholesaler: false, status: null, quote: (p: { price: number | string }) => ({ price: Number(p.price), retailPrice: Number(p.price), minQty: 1, isWholesale: false }), loading: false }),
}));

vi.mock('@/lib/productImage', () => ({
  getProductPublicUrl: (path: string | null) => (path ? `https://img.test/${path}` : null),
  getProductImageUrl: async (path: string | null) => (path ? `https://img.test/${path}` : null),
}));

import SellPage from '../SellPage';

const renderSell = () =>
  render(
    <MemoryRouter initialEntries={['/sell']}>
      <SellPage />
    </MemoryRouter>
  );

describe('SellPage (merchant funnel, Depop Sell-page grammar)', () => {
  it('leads with the outcome hero and a start-selling CTA', () => {
    renderSell();
    const hero = screen.getByRole('region', { name: /sell on deliveryace/i });
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(/turn your kitchen into orders/i);
    const cta = within(hero).getByRole('link', { name: /start selling/i });
    expect(cta).toHaveAttribute('href', '/auth?tab=signup');
  });

  it('carries the three honest trust tiles', () => {
    renderSell();
    const hero = screen.getByRole('region', { name: /sell on deliveryace/i });
    const text = hero.textContent ?? '';
    expect(text).toMatch(/no fleet needed/i);
    expect(text).toMatch(/tracked/i);
    expect(text).toMatch(/door to door/i);
    expect(text).toMatch(/same-day settlement/i);
  });

  it('explains selling in exactly three steps', () => {
    renderSell();
    const steps = screen.getByRole('region', { name: /selling is simple/i });
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const text = items.map(i => i.textContent).join(' ');
    expect(text).toMatch(/open your store/i);
    expect(text).toMatch(/list your products/i);
    expect(text).toMatch(/orders come in/i);
  });

  it('proves it with real stores, linked to their storefronts', async () => {
    renderSell();
    const proof = await screen.findByRole('region', { name: /meet the stores/i });
    expect(within(proof).getByRole('link', { name: /kai grill/i })).toHaveAttribute('href', '/shop/m/m1');
    expect(within(proof).getByRole('link', { name: /serra bakery/i })).toHaveAttribute('href', '/shop/m/m2');
    expect(proof.querySelectorAll('img').length).toBeGreaterThanOrEqual(1);
  });

  it('closes with the money-local band', async () => {
    renderSell();
    const band = await screen.findByRole('region', { name: /keep money local/i });
    const cta = within(band).getByRole('link', { name: /start selling/i });
    expect(cta).toHaveAttribute('href', '/auth?tab=signup');
  });

  it('hides the stores section when the catalog is empty', async () => {
    railState.products = [];
    renderSell();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole('region', { name: /meet the stores/i })).not.toBeInTheDocument();
    railState.products = [
      { id: 'p1', merchant_id: 'm1', name: 'Chicken Yassa', price: 20, image_path: 'a.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString(), merchants: { id: 'm1', name: 'Kai Grill' } },
      { id: 'p2', merchant_id: 'm2', name: 'Fresh Tapalapa', price: 10, image_path: 'b.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString(), merchants: { id: 'm2', name: 'Serra Bakery' } },
    ];
  });

});
