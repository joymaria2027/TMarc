import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WholesaleApplyPage from '../WholesaleApplyPage';

/**
 * Content-first cold start for /wholesale (issue: public-routes-content-first/02).
 *
 * The signed-out page is a static sign-in card that needs no session knowledge,
 * so a pending session must render it immediately — never the
 * "Loading wholesale account…" gate.
 */

const { authState, fromSpy } = vi.hoisted(() => ({
  authState: {
    user: null as unknown,
    loading: true,
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

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/wholesale']}>
      <WholesaleApplyPage />
    </MemoryRouter>
  );

beforeEach(() => {
  fromSpy.mockReset();
  // Benign resolved chain: the signed-in case legitimately fetches the
  // application row; the anonymous case asserts it is never called at all.
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
  authState.user = null;
  authState.loading = true;
});

describe('WholesaleApplyPage content-first first paint (public-routes-content-first/02)', () => {
  it('renders the anonymous wholesale card while the session is still loading', () => {
    renderPage();

    expect(screen.getByText(/become a wholesale buyer/i)).toBeInTheDocument();
    // The storefront nav also renders a generic "Create account" link — match
    // the page card by its wholesale-specific href.
    const createAccount = screen.getAllByRole('link', { name: /create account/i })
      .find(a => a.getAttribute('href')?.includes('as=wholesaler'));
    expect(createAccount).toBeDefined();
    expect(createAccount).toHaveAttribute(
      'href',
      '/auth?as=wholesaler&tab=signup&next=/wholesale'
    );
    // The old blocking gate rendered this exact label — never again.
    expect(screen.queryByText(/loading wholesale account/i)).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('still loads the application only for signed-in users', () => {
    authState.user = { id: 'u1' };
    authState.loading = false;
    renderPage();

    // Signed-in users see the loading state until their application row resolves.
    expect(screen.getByText(/loading wholesale account/i)).toBeInTheDocument();
  });
});
