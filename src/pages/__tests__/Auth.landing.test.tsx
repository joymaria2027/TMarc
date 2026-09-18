import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The logged-out /auth page doubles as the product's landing page ("/" redirects
// here), so its left panel carries the CRO contract: outcome headline, primary
// CTA, a route for customer shoppers, exactly 3 objection bullets, and legal
// consent links. These tests lock that contract.

const mocks = vi.hoisted(() => ({
  user: null as unknown,
  loading: false,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mocks.user,
    session: null,
    roles: [],
    loading: mocks.loading,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: vi.fn(() => false),
  }),
}));

// Auth imports the real Supabase client at module scope (createClient runs on
// import), so it must be replaced before Auth.tsx is loaded.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import Auth from '../Auth';

const renderAuth = () =>
  render(
    <MemoryRouter initialEntries={['/auth']}>
      <Auth />
    </MemoryRouter>
  );

beforeEach(() => {
  mocks.user = null;
  mocks.loading = false;
});

describe('Auth landing panel (CRO contract)', () => {
  it('leads with the outcome headline, not a feature list', () => {
    renderAuth();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    // Exactly one: the mobile pitch is a styled <p> so the page keeps a single h1.
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toMatch(/track every delivery/i);
    expect(h1s[0].textContent).toMatch(/settle every dalasi/i);
  });

  it('offers a primary signup CTA and routes customer shoppers to the shop funnel', () => {
    renderAuth();
    expect(screen.getByRole('link', { name: /start free/i })).toHaveAttribute(
      'href',
      '/auth?tab=signup'
    );
    const orderLinks = screen.getAllByRole('link', { name: /order instead/i });
    expect(orderLinks.length).toBeGreaterThanOrEqual(1);
    expect(orderLinks[0]).toHaveAttribute('href', '/auth?as=customer&tab=signup');
  });

  it('handles exactly 3 objections, one per audience', () => {
    renderAuth();
    const region = screen.getByRole('region', { name: /about deliveryace/i });
    const bullets = within(region).getAllByRole('listitem');
    expect(bullets).toHaveLength(3);
    const text = bullets.map(b => b.textContent).join(' ');
    expect(text).toMatch(/riders/i);
    expect(text).toMatch(/managers/i);
    expect(text).toMatch(/finance/i);
  });

  it('shows legal consent with a privacy policy link on the landing panel', () => {
    renderAuth();
    const region = screen.getByRole('region', { name: /about deliveryace/i });
    const privacy = within(region).getAllByRole('link', { name: /privacy policy/i });
    expect(privacy.length).toBeGreaterThanOrEqual(1);
    expect(privacy[0]).toHaveAttribute('href', '/privacy');
  });

  it('keeps the sign-in form working underneath the pitch', () => {
    renderAuth();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /create account/i })).toBeInTheDocument();
  });
});
