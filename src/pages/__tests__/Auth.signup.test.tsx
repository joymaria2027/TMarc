import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Friction-fix 03 contract: password visibility toggle on both tabs,
// upfront requirement hint + expectation copy on the signup tab.
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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import Auth from '../Auth';

const renderAuth = (entry = '/auth') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Auth />
    </MemoryRouter>
  );

beforeEach(() => {
  mocks.user = null;
  mocks.loading = false;
});

describe('Auth signup friction (friction-fix 03 contract)', () => {
  it('toggles password visibility on the signin tab', () => {
    renderAuth();
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    expect(password.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('shows the requirement upfront and sets expectations on signup', () => {
    renderAuth('/auth?tab=signup');
    fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    expect(screen.getByText(/6\+ characters/i)).toBeInTheDocument();
    expect(screen.getByText(/takes 30 seconds/i)).toBeInTheDocument();
  });
});
