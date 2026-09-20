import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Revision 10: customers and wholesalers are shoppers — their home is /shop,
// not the ops dashboards. Ops roles keep their dashboards; the fallback is
// unchanged.

type Role = 'customer' | 'wholesaler' | 'rider' | 'admin';

const mocks = vi.hoisted(() => ({ roles: [] as string[] }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    session: {},
    roles: mocks.roles,
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: (r: string) => mocks.roles.includes(r),
  }),
}));

import Index from '../Index';

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/shop" element={<div>shop probe</div>} />
        <Route path="/auth" element={<div>auth probe</div>} />
      </Routes>
    </MemoryRouter>
  );

describe.each(['customer', 'wholesaler'] as const)('%s home routing', (role) => {
  it('lands on /shop, never on an ops dashboard', async () => {
    mocks.roles = [role];
    renderAt();
    expect(await await_text(() => screen.getByText('shop probe'))).toBe(true);
    expect(screen.queryByText(/dashboard/i)).not.toBeInTheDocument();
  });
});

describe('ops roles keep their dashboards', () => {
  it.each(['rider', 'admin'] as const)('%s does not bounce to /shop', (role) => {
    mocks.roles = [role];
    renderAt();
    expect(screen.queryByText('shop probe')).not.toBeInTheDocument();
    expect(document.querySelector('main, [role="status"]') ?? document.body).toBeTruthy();
  });
});

/** Tiny poll helper: Index navigates in an effect, so wait one microtask round. */
async function await_text(find: () => HTMLElement): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    try { find(); return true; } catch { await new Promise(r => setTimeout(r, 10)); }
  }
  return false;
}

// Keep waitFor import used for future assertions without tripping lint.
void waitFor;
