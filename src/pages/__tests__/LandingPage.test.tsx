import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    roles: [],
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: vi.fn(() => false),
  }),
}));

// Revision 10: the landing gains an Icebug-style product rail fed by the
// same catalog query the shop uses. Mocked here so the rail contract is
// testable without a backend.
const railState = vi.hoisted(() => ({
  products: [
    { id: 'p1', merchant_id: 'm1', name: 'Chicken Yassa', price: 20, image_path: 'a.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString() },
    { id: 'p2', merchant_id: 'm2', name: 'Fresh Tapalapa', price: 10, image_path: 'b.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString() },
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
          Promise.resolve({ data: table === 'products' ? railState.products : [], error: null }).then(res, rej),
      };
      return p;
    },
  },
}));

vi.mock('@/lib/productImage', () => ({
  getProductPublicUrl: (path: string | null) => (path ? `https://img.test/${path}` : null),
  getProductImageUrl: async (path: string | null) => (path ? `https://img.test/${path}` : null),
}));

import LandingPage from '../LandingPage';

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <LandingPage />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.removeItem('dg-theme-mode');
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('LandingPage (public marketing page at "/")', () => {
  it('leads with the outcome headline', () => {
    renderLanding();
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toMatch(/track every delivery/i);
    expect(h1[0].textContent).toMatch(/settle every dalasi/i);
  });

  it('gives ops visitors and customer shoppers separate doors', () => {
    renderLanding();
    expect(screen.getAllByRole('link', { name: /start free/i })[0]).toHaveAttribute(
      'href',
      '/auth?tab=signup'
    );
    expect(screen.getAllByRole('link', { name: /order delivery|order a delivery/i }).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('explains the product in exactly three steps', () => {
    const { container } = renderLanding();
    const steps = container.querySelector('ol')!;
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const text = items.map(i => i.textContent).join(' ');
    expect(text).toMatch(/riders accept/i);
    expect(text).toMatch(/managers watch/i);
    expect(text).toMatch(/finance settles/i);
  });

  it('answers exactly three objections', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { name: /fair questions/i });
    const list = heading.closest('section')!.querySelector('ul')!;
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('closes with a second Start-here CTA and carries legal links', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { name: /accounted for by tonight/i });
    const cta = within(heading.closest('section')!).getByRole('link', { name: /start here/i });
    expect(cta).toHaveAttribute('href', '/auth?tab=signup');

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('labels each step with its audience, Icebug-style', () => {
    const { container } = renderLanding();
    const steps = container.querySelector('ol')!;
    const text = within(steps).getAllByRole('listitem').map(i => i.textContent).join(' ');
    expect(text).toMatch(/for riders/i);
    expect(text).toMatch(/for managers/i);
    expect(text).toMatch(/for finance/i);
  });

  it('sets the hero scene in the rain', () => {
    renderLanding();
    // The Icebug-style scene label is visible content (like "Evening rain"),
    // not decoration: it names the element for everyone.
    expect(screen.getByText(/evening rain/i)).toBeInTheDocument();
  });

  it('splits the nav: audience anchors and utility links', () => {
    renderLanding();
    const nav = screen.getByRole('navigation', { name: /audience/i });
    expect(within(nav).getByRole('link', { name: /for riders/i })).toHaveAttribute('href', '#riders');
    expect(within(nav).getByRole('link', { name: /for managers/i })).toHaveAttribute('href', '#managers');
    expect(within(nav).getByRole('link', { name: /for finance/i })).toHaveAttribute('href', '#finance');

    const primary = screen.getByRole('navigation', { name: /primary/i });
    expect(within(primary).getByRole('link', { name: /order delivery/i })).toHaveAttribute('href', '/shop');
    expect(within(primary).getByRole('link', { name: /start free/i })).toHaveAttribute('href', '/auth?tab=signup');
  });

  it('offers the outlined START HERE hero path', () => {
    renderLanding();
    // "Start here" appears in the hero and again in the closing section.
    const startHere = screen.getAllByRole('link', { name: /start here/i });
    expect(startHere.length).toBeGreaterThanOrEqual(2);
    expect(startHere[0]).toHaveAttribute('href', '/auth?tab=signup');
  });

  it('flips the theme from the footer LIGHT / DARK / SYSTEM toggle', () => {
    renderLanding();
    fireEvent.click(screen.getByRole('button', { name: /^dark$/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^light$/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('whispers a statement break between the loud sections', () => {
    renderLanding();
    const statement = screen.getByText(/every kilometre, every dalasi/i);
    expect(statement.closest('section')).toBeTruthy();
  });

  it('runs the banner-to-rail rhythm for the audience steps', () => {
    const { container } = renderLanding();
    const banner = screen.getByRole('heading', { name: /three jobs\. one map\./i });
    // Banner headline hugs the bottom-left of its full-bleed section.
    expect(banner.closest('section')!.className).toMatch(/bg-sidebar/);
    const rail = container.querySelector('ol')!;
    expect(rail.className).toMatch(/overflow-x-auto/);
    expect(within(rail).getAllByRole('listitem')).toHaveLength(3);
  });

  it('carries mono proof badges in the footer', () => {
    renderLanding();
    const footer = screen.getByRole('contentinfo');
    const badges = within(footer).getByText(/96% on time/i);
    expect(badges.closest('div')!.className).toMatch(/font-mono/);
  });

  it('lets visitors self-segment through two door tiles', () => {
    renderLanding();
    expect(screen.getByText(/you run deliveries/i)).toBeInTheDocument();
    expect(screen.getByText(/you need something moved/i)).toBeInTheDocument();
    const doors = screen.getByText(/you run deliveries/i).closest('section')!;
    expect(within(doors).getByRole('link', { name: /^start free$/i })).toHaveAttribute('href', '/auth?tab=signup');
    expect(within(doors).getByRole('link', { name: /^order a delivery$/i })).toHaveAttribute('href', '/shop');
    expect(within(doors).getByRole('link', { name: /wholesale pricing/i })).toHaveAttribute('href', '/wholesale');
  });

  it('states the promise as a triad', () => {
    renderLanding();
    const promise = screen.getByText(/fair fees\. live tracking\. money settled/i);
    expect(promise.closest('section')).toBeTruthy();
  });

  it('carries a values band that points at settlement', () => {
    renderLanding();
    expect(screen.getByText(/riders first\. then the merchants\. then us\./i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /see how settlement works/i });
    expect(link).toHaveAttribute('href', '#finance');
  });

  it('ships a mega footer with product, company, and legal columns', () => {
    renderLanding();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Product')).toBeInTheDocument();
    expect(within(footer).getByText('Company')).toBeInTheDocument();
    expect(within(footer).getByText('Legal')).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy');
  });

  it('hides the decorative dispatch card from assistive tech', () => {
    const { container } = renderLanding();
    // Several small icons are aria-hidden; the whole dispatch card must be too.
    const card = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .find(el => /live dispatch/i.test(el.textContent ?? ''));
    expect(card).toBeDefined();
  });

  it('shows live products in an Icebug-style rail with a shop-all door', async () => {
    renderLanding();
    const rail = await screen.findByRole('region', { name: /fresh from the stores/i });
    expect(within(rail).getByRole('link', { name: /shop all/i })).toHaveAttribute('href', '/shop');
    const yassa = within(rail).getByRole('link', { name: /chicken yassa/i });
    expect(yassa).toHaveAttribute('href', '/shop/p/p1');
    expect(within(rail).getByText('D 20.00')).toBeInTheDocument();
    expect(within(rail).getByText('D 10.00')).toBeInTheDocument();
  });

  it('rail Prev/Next controls scroll the strip', async () => {
    renderLanding();
    const rail = await screen.findByRole('region', { name: /fresh from the stores/i });
    const strip = rail.querySelector('[data-rail-strip]') as HTMLElement;
    // jsdom has no scrollBy; provide a stub and assert against it.
    const scrollBy = vi.fn();
    strip.scrollBy = scrollBy;
    fireEvent.click(within(rail).getByRole('button', { name: /next products/i }));
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
    fireEvent.click(within(rail).getByRole('button', { name: /previous products/i }));
    expect(scrollBy).toHaveBeenCalledTimes(2);
  });

  it('omits the rail entirely when the catalog is empty', async () => {
    railState.products = [];
    renderLanding();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole('region', { name: /fresh from the stores/i })).not.toBeInTheDocument();
    railState.products = [
      { id: 'p1', merchant_id: 'm1', name: 'Chicken Yassa', price: 20, image_path: 'a.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString() },
      { id: 'p2', merchant_id: 'm2', name: 'Fresh Tapalapa', price: 10, image_path: 'b.jpg', available_today: true, track_inventory: false, quantity: 0, created_at: new Date().toISOString() },
    ];
  });
});
