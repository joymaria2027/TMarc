import { describe, it, vi, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FraudPage from '@/pages/FraudPage';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, hasRole: () => true, roles: ['admin'] }),
}));

const makeQuery = (data: unknown[] = []) => {
  const q: Record<string, unknown> = {};
  const self = Promise.resolve({ data, error: null });
  Object.assign(q, {
    then: self.then.bind(self),
    catch: self.catch.bind(self),
    finally: (self as Promise<unknown>).finally.bind(self),
    select: () => q,
    eq: () => q,
    order: () => q,
  });
  return q;
};

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn(() =>
    Promise.resolve({
      data: {
        generated_at: new Date().toISOString(),
        // DB/RPC can return severities outside critical|warning|info —
        // the page must not white-screen on them.
        checks: [
          { key: 'k1', label: 'Unknown-severity check', severity: 'high', count: 2, sample: [] },
        ],
        acknowledged: {},
      },
      error: null,
    }),
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeQuery([])),
    rpc,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('FraudPage unknown severity', () => {
  it('renders instead of white-screening', async () => {
    render(
      <MemoryRouter>
        <FraudPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Unknown-severity check')).toBeTruthy();
  });
});
