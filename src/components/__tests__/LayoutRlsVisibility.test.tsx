import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../Layout';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'u1', email: 'test@example.com' },
    roles: [] as string[],
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    roles: authState.roles,
    signOut: vi.fn(),
    hasRole: (role: string) => authState.roles.includes(role),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: 0, data: [], error: null }),
      }),
    }),
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/components/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle" />,
}));

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Layout>
        <div>child</div>
      </Layout>
    </MemoryRouter>
  );

describe('Layout RLS Verification visibility (rls-verification-visibility/01)', () => {
  beforeEach(() => {
    authState.roles = [];
  });

  it.each([['admin'], ['app_developer']])(
    'shows RLS Verification for platform role %s',
    (role) => {
      authState.roles = [role];
      renderLayout();
      expect(screen.getByRole('link', { name: /rls verification/i })).toBeInTheDocument();
    }
  );

  it.each([
    ['rider'],
    ['accountant'],
    ['business_owner'],
    ['company_manager'],
  ])('hides RLS Verification for non-platform role %s', (role) => {
    authState.roles = [role];
    renderLayout();
    expect(screen.queryByRole('link', { name: /rls verification/i })).toBeNull();
  });
});
