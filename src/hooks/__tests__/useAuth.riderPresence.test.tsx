import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * Ticket: any rider signed in is automatically online.
 * AuthProvider marks riders online on session, offline on sign-out.
 */

const { supabaseState } = vi.hoisted(() => {
  const state = {
    persistedSession: null as { user: { id: string } } | null,
    authEvents: [] as Array<{ event: string; session: { user: { id: string } } | null }>,
    authChangeCallbacks: new Set<(event: string, session: { user: { id: string } } | null) => void>(),
    emitAuthEvent: (event: string, session: { user: { id: string } } | null) => {
      state.authEvents.push({ event, session });
      for (const cb of [...state.authChangeCallbacks]) cb(event, session);
    },
    riderWrites: [] as Array<{ values: unknown; col: string; val: unknown }>,
    signedOut: false,
  };
  return { supabaseState: state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'user_roles') {
        const q = {
          then: (onFul?: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(onFul),
          catch: (onRej?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).catch(onRej),
          select: () => q,
          eq: () => q,
        };
        return q;
      }
      if (table === 'riders') {
        return {
          update: (values: unknown) => ({
            eq: (col: string, val: unknown) => {
              supabaseState.riderWrites.push({ values, col, val });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    auth: {
      onAuthStateChange: (cb: (event: string, session: { user: { id: string } } | null) => void) => {
        supabaseState.authChangeCallbacks.add(cb);
        for (const e of supabaseState.authEvents) cb(e.event, e.session);
        return { data: { subscription: { unsubscribe: () => supabaseState.authChangeCallbacks.delete(cb) } } };
      },
      getSession: () => Promise.resolve({ data: { session: supabaseState.persistedSession } }),
      signOut: () => {
        supabaseState.signedOut = true;
        return Promise.resolve({ error: null });
      },
    },
  },
}));

import { AuthProvider, useAuth, _resetRolesInFlightForTesting } from '@/hooks/useAuth';

const flushTasks = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

let capturedSignOut: (() => Promise<void>) | null = null;
function Probe() {
  const auth = useAuth();
  capturedSignOut = auth.signOut;
  return null;
}

describe('useAuth rider presence (signed-in => online)', () => {
  beforeEach(() => {
    _resetRolesInFlightForTesting();
    supabaseState.persistedSession = null;
    supabaseState.authEvents.length = 0;
    supabaseState.authChangeCallbacks.clear();
    supabaseState.riderWrites.length = 0;
    supabaseState.signedOut = false;
    capturedSignOut = null;
  });

  it('marks rider online+active when a session appears', async () => {
    supabaseState.persistedSession = { user: { id: 'rider-u1' } };
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      await flushTasks();
    });
    expect(supabaseState.riderWrites).toContainEqual({
      values: { is_online: true, is_active: true },
      col: 'user_id',
      val: 'rider-u1',
    });
  });

  it('marks rider offline when session clears, and on explicit signOut', async () => {
    supabaseState.persistedSession = { user: { id: 'rider-u2' } };
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      await flushTasks();
    });
    expect(supabaseState.riderWrites).toContainEqual({
      values: { is_online: true, is_active: true },
      col: 'user_id',
      val: 'rider-u2',
    });

    await act(async () => {
      supabaseState.emitAuthEvent('SIGNED_OUT', null);
      await flushTasks();
    });
    expect(supabaseState.riderWrites).toContainEqual({
      values: { is_online: false },
      col: 'user_id',
      val: 'rider-u2',
    });

    // Explicit signOut also best-effort marks offline (delayed-event safety).
    supabaseState.riderWrites.length = 0;
    await act(async () => {
      supabaseState.emitAuthEvent('SIGNED_IN', { user: { id: 'rider-u3' } });
      await flushTasks();
    });
    await act(async () => {
      await capturedSignOut!();
      await flushTasks();
    });
    expect(supabaseState.signedOut).toBe(true);
    expect(supabaseState.riderWrites).toContainEqual({
      values: { is_online: false },
      col: 'user_id',
      val: 'rider-u3',
    });
  });
});
