import { describe, it, vi, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Regression: all finance routes white-screened in production
// (t-marc.vercel.app/settlements + 6 siblings). Root causes were
// TDZ crashes (useState(defaultTab) / useCallback deps evaluated before
// the const declaration) and missing Card/lucide imports that Vite leaves
// as free variables until render. This test mounts every finance page
// with stubbed auth + supabase and fails on any synchronous throw.

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    hasRole: (r: string) => r === 'admin',
    roles: ['admin'],
  }),
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
    in: () => q,
    order: () => q,
    gte: () => q,
    lte: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
  });
  return q;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeQuery([])),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const pages = [
  'SettlementsPage',
  'PayrollPage',
  'RevenueSharingPage',
  'WalletPage',
  'RiderExpensesPage',
  'ExpenseTypesPage',
  'ReconciliationPage',
] as const;

describe('finance pages mount without white-screen throw', () => {
  for (const name of pages) {
    it(`${name} renders`, async () => {
      const mod = await import(`@/pages/${name}.tsx`);
      expect(() => render(<MemoryRouter>{<mod.default />}</MemoryRouter>)).not.toThrow();
    });
  }
});
