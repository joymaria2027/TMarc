import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * Roles prewarm (issue: prewarm-roles-swap-in/01).
 *
 * The user id is known within the landing-paint window (persisted session), so
 * the roles query must fly under that paint — and the post-session paths
 * (getSession, onAuthStateChange) must reuse the in-flight query for the same
 * user instead of re-issuing it (dedupe). A late resolution for a stale user
 * (sign-out/sign-in race) must never overwrite the current user's roles.
 */

type Deferred = {
  promise: Promise<{ data: Array<{ role: string }>; error: null }>;
  resolve: (v: { data: Array<{ role: string }>; error: null }) => void;
};

const { supabaseState } = vi.hoisted(() => {
  const state = {
    // Session returned by getSession (persisted session in real life).
    persistedSession: null as { user: { id: string } } | null,
    // Auth-state events delivered to subscribers (queued before subscribe OK).
    authEvents: [] as Array<{ event: string; session: { user: { id: string } } | null }>,
    authChangeCallbacks: new Set<(event: string, session: { user: { id: string } } | null) => void>(),
    emitAuthEvent: (event: string, session: { user: { id: string } } | null) => {
      state.authEvents.push({ event, session });
      for (const cb of [...state.authChangeCallbacks]) cb(event, session);
    },
    // One deferred per issued user query; each issue records the user id.
    deferred: new Map<string, Deferred>(),
    issues: [] as string[],
  };
  return { supabaseState: state };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'user_roles') throw new Error(`unexpected table ${table}`);
      let userId: string | null = null;
      let issued = false;
      const issue = (id: string) => {
        if (issued || !id) return;
        issued = true;
        userId = id;
        supabaseState.issues.push(id);
        if (!supabaseState.deferred.has(id)) {
          let resolve!: Deferred['resolve'];
          const promise = new Promise<Deferred['promise'] extends never ? never : { data: Array<{ role: string }>; error: null }>((res) => { resolve = res; });
          void promise.catch(() => {});
          supabaseState.deferred.set(id, { promise: promise as Deferred['promise'], resolve });
        }
      };
      const settle = () => {
        const d = supabaseState.deferred.get(userId as string);
        return d ? d.promise : Promise.resolve({ data: [], error: null });
      };
      const q = {
        then: (onFul?: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) =>
          settle().then(onFul, onRej),
        catch: (onRej?: (e: unknown) => unknown) => settle().catch(onRej),
        finally: (onFin?: () => void) => settle().finally(onFin),
        select: () => q,
        eq: (_col: string, id: string) => { issue(id); return q; },
      };
      return q;
    },
    auth: {
      onAuthStateChange: (cb: (event: string, session: { user: { id: string } } | null) => void) => {
        supabaseState.authChangeCallbacks.add(cb);
        for (const e of supabaseState.authEvents) cb(e.event, e.session);
        return { data: { subscription: { unsubscribe: () => supabaseState.authChangeCallbacks.delete(cb) } } };
      },
      getSession: () => Promise.resolve({ data: { session: supabaseState.persistedSession } }),
    },
  },
}));

import { AuthProvider, useAuth, _resetRolesInFlightForTesting } from '@/hooks/useAuth';

/** Flush macrotasks: getSession's microtask queues the prewarm on a later tick. */
const flushTasks = async () => {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
};

let captured: { user: unknown; roles: string[]; rolesReady: boolean; loading: boolean };
function Probe() {
  const auth = useAuth();
  captured = { user: auth.user, roles: auth.roles as string[], rolesReady: auth.rolesReady, loading: auth.loading };
  return null;
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

describe('useAuth roles prewarm (prewarm-roles-swap-in/01)', () => {
  beforeEach(() => {
    _resetRolesInFlightForTesting();
    supabaseState.persistedSession = null;
    supabaseState.authEvents.length = 0;
    supabaseState.authChangeCallbacks.clear();
    supabaseState.deferred.clear();
    supabaseState.issues.length = 0;
    captured = { user: null, roles: [], rolesReady: false, loading: true };
  });

  it('issues the roles query while the landing paints — without waiting for getSession', async () => {
    supabaseState.persistedSession = { user: { id: 'u1' } };
    // getSession never resolves in this test (deferred pending): the prewarm
    // must not wait for it.
    renderAuth();
    await flushTasks();
    expect(supabaseState.issues).toEqual(['u1']);
  });

  it('dedupes: post-session paths reuse the in-flight query, one issue per user', async () => {
    supabaseState.persistedSession = { user: { id: 'u1' } };
    renderAuth();

    await act(async () => {
      await flushTasks(); // prewarm issues here
      supabaseState.emitAuthEvent('INITIAL_SESSION', { user: { id: 'u1' } });
      await flushTasks(); // getSession continuation + auth-event path run here
    });

    expect(supabaseState.issues).toEqual(['u1']);
  });

  it('re-fetches for a new user and discards a stale user’s late resolution', async () => {
    supabaseState.persistedSession = { user: { id: 'u1' } };
    renderAuth();
    await flushTasks();
    expect(supabaseState.issues).toEqual(['u1']);

    await act(async () => {
      supabaseState.emitAuthEvent('SIGNED_IN', { user: { id: 'u2' } });
      await flushTasks();
    });
    expect(supabaseState.issues).toEqual(['u1', 'u2']);

    // u1's query lands late, after the user switched to u2: it must be
    // discarded — roles stay empty until u2's own data arrives.
    await act(async () => {
      supabaseState.deferred.get('u1')!.resolve({ data: [{ role: 'admin' }], error: null });
      await flushTasks();
    });
    expect(captured.roles).toEqual([]);
    expect(captured.rolesReady).toBe(false);

    // u2's data lands: roles (and rolesReady) reflect the current user.
    await act(async () => {
      supabaseState.deferred.get('u2')!.resolve({ data: [{ role: 'rider' }], error: null });
      await flushTasks();
    });
    expect(captured.roles).toEqual(['rider']);
    expect(captured.user).toEqual({ id: 'u2' });
    expect(captured.rolesReady).toBe(true);
  });
});
