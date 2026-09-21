import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const MSGS = [
  {
    id: 'm1',
    order_id: 'o1',
    sender_user_id: 'u1',
    sender_role: 'customer',
    body: 'When will my order be ready?',
    read_at: '2026-09-21T10:12:00Z',
    created_at: '2026-09-21T10:11:50Z',
  },
  {
    id: 'm2',
    order_id: 'o1',
    sender_user_id: 'u1',
    sender_role: 'merchant',
    body: 'Order is ready',
    read_at: '2026-09-21T10:16:08Z',
    created_at: '2026-09-21T10:16:06Z',
  },
];

function chainable(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'update', 'in', 'limit']) {
    c[m] = vi.fn(() => c);
  }
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => chainable({ data: MSGS })),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  // Same account under both roles — the reported scenario.
  useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/haptics', () => ({
  haptics: { success: vi.fn(), error: vi.fn(), selectionChanged: vi.fn() },
}));

import OrderChat from '../OrderChat';

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});

const bubbleLi = (role: string) => {
  const bubble = screen.getByRole('button', { name: new RegExp(`Message from ${role}`) });
  return bubble.closest('li');
};

describe('order chat role mirror', () => {
  it('merchant POV: customer left, merchant right', async () => {
    render(<OrderChat orderId="o1" senderRole="merchant" />);
    await waitFor(() => expect(bubbleLi('customer')).not.toBeNull());
    expect(bubbleLi('customer')!.className).toMatch(/justify-start/);
    expect(bubbleLi('merchant')!.className).toMatch(/justify-end/);
  });

  it('customer POV: mirrored', async () => {
    render(<OrderChat orderId="o1" senderRole="customer" />);
    await waitFor(() => expect(bubbleLi('merchant')).not.toBeNull());
    expect(bubbleLi('merchant')!.className).toMatch(/justify-start/);
    expect(bubbleLi('customer')!.className).toMatch(/justify-end/);
  });

  it('counterpart labels follow the viewer role', async () => {
    const { unmount } = render(<OrderChat orderId="o1" senderRole="merchant" />);
    await waitFor(() => expect(bubbleLi('customer')).not.toBeNull());
    expect(screen.getByLabelText('Message customer')).toBeInTheDocument();
    unmount();
    render(<OrderChat orderId="o1" senderRole="customer" />);
    await waitFor(() => expect(bubbleLi('customer')).not.toBeNull());
    expect(screen.getByLabelText('Message merchant')).toBeInTheDocument();
  });
});
