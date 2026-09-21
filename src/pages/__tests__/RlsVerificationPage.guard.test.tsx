import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RlsVerificationPage from '../RlsVerificationPage';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'u1', email: 'rider@example.com' },
    roles: [] as string[],
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    roles: authState.roles,
    hasRole: (role: string) => authState.roles.includes(role),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          limit: () => Promise.resolve({ data: [], count: 0, error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], count: 0, error: null }) }),
        }),
        limit: () => Promise.resolve({ data: [], count: 0, error: null }),
        order: () => ({ limit: () => Promise.resolve({ data: [], count: 0, error: null }) }),
      }),
    }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <RlsVerificationPage />
    </MemoryRouter>
  );

describe('RlsVerificationPage guard (rls-verification-visibility/02)', () => {
  it.each([['rider'], ['accountant'], ['business_owner'], ['company_manager']])(
    'shows Access Restricted for non-platform role %s',
    (role) => {
      authState.roles = [role];
      renderPage();
      expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
      expect(screen.queryByText(/current session/i)).toBeNull();
    }
  );

  it.each([['admin'], ['app_developer']])('renders full tool for platform role %s', (role) => {
    authState.roles = [role];
    renderPage();
    expect(screen.getByRole('heading', { name: /rls verification/i })).toBeInTheDocument();
    expect(screen.getByText(/current session/i)).toBeInTheDocument();
    expect(screen.queryByText(/access restricted/i)).toBeNull();
  });
});
