import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WebhookEventsPage from '@/pages/WebhookEventsPage';

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
    limit: () => q,
  });
  return q;
};

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(() =>
    Promise.resolve({ data: { processing_status: 'processed' }, error: null }),
  ),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() =>
      makeQuery([
        {
          id: 'e1',
          event_type: 'payment.success',
          payment_reference: 'REF1',
          order_id: 'order-11111111',
          received_at: new Date().toISOString(),
          processing_status: 'processed',
          signature_valid: true,
          payload_json: { ok: true },
        },
      ]),
    ),
    functions: { invoke },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('WebhookEventsPage clicks', () => {
  it('toggles details and replays without throwing', async () => {
    render(
      <MemoryRouter>
        <WebhookEventsPage />
      </MemoryRouter>,
    );
    const toggle = await screen.findByLabelText(/toggle details/i);
    expect(() => fireEvent.click(toggle)).not.toThrow();
    const replay = await screen.findByRole('button', { name: /replay/i });
    fireEvent.click(replay);
    await waitFor(() => expect(invoke).toHaveBeenCalled());
  });
});
