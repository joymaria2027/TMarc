import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RootRoute from '../RootRoute';

// jsdom lacks ResizeObserver; recharts' ResponsiveContainer (AdminDashboard) needs it.
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * Content-first cold start at "/" (issue: cold-start-content-first/01).
 *
 * The old ProtectedIndex blocked on `useAuth().loading` with a full-screen
 * spinner before deciding landing vs dashboard. The landing page is static
 * markup, so "/" now renders it immediately while the session resolves and
 * swaps in the role dashboard only when a user materializes.
 */

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as unknown,
    roles: [] as string[],
    loading: true,
    rolesReady: false,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    ...authState,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: (role: string) => authState.roles.includes(role),
  }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = (data: unknown[] = []) => {
    const q: Record<string, unknown> = {};
    const self = Promise.resolve({ data, error: null });
    Object.assign(q, {
      then: self.then.bind(self),
      catch: self.catch.bind(self),
      finally: (self as Promise<unknown>).finally.bind(self),
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      gte: () => q,
      lte: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      update: () => q,
    });
    return q;
  };
  return {
    supabase: {
      from: () => makeQuery([]),
      rpc: () => Promise.resolve({ data: [], error: null }),
      channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
      removeChannel: vi.fn(),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
    },
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderRoot = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <RootRoute />
    </MemoryRouter>
  );

describe('RootRoute (content-first cold start at "/")', () => {
  it('renders the landing content immediately while the session is still loading', () => {
    authState.user = null;
    authState.loading = true;
    renderRoot();

    // First paint carries content, not a spinner and not a blank screen.
    expect(
      screen.getByRole('heading', { level: 1, name: /track every delivery/i })
    ).toBeInTheDocument();
    // The old blocking gate rendered a role="status" spinner — it must never appear.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps painting the landing while the user exists but roles are still resolving', () => {
    authState.user = { id: 'u1' };
    authState.roles = [];
    authState.loading = false;
    authState.rolesReady = false;
    renderRoot();

    // The prewarm window: the dashboard must not mount half-primed — the
    // landing stays up until roles land (issue: prewarm-roles-swap-in/01).
    expect(
      screen.getByRole('heading', { level: 1, name: /track every delivery/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the role dashboard once the session exists and roles are ready', async () => {
    authState.user = { id: 'u1' };
    authState.roles = ['admin'];
    authState.loading = false;
    authState.rolesReady = true;
    renderRoot();

    // Dashboard content (AdminDashboard renders this under its data spinner).
    expect(await screen.findByText(/overview of delivery operations/i)).toBeInTheDocument();
    // The landing hero is gone.
    expect(screen.queryByRole('heading', { name: /track every delivery/i })).toBeNull();
  });

  it('falls back to the landing page when there is no session', () => {
    authState.user = null;
    authState.loading = false;
    authState.rolesReady = false;
    renderRoot();

    expect(
      screen.getByRole('heading', { level: 1, name: /track every delivery/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
