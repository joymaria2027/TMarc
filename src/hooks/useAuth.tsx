import { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { markRiderOfflineByUserId, markRiderOnlineByUserId } from '@/lib/riderPresence';

type AppRole = 'admin' | 'rider' | 'accountant' | 'company_manager' | 'business_owner' | 'app_developer' | 'customer' | 'wholesaler';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  /** user is known AND roles resolved — the swap-in condition for role-aware UI. */
  rolesReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * One in-flight roles query per user id. Session restore and auth-state events
 * share it instead of racing duplicate queries (the client fires
 * INITIAL_SESSION and resolves getSession on the same cold start), and a
 * resolution for a stale user (sign-out/sign-in race) never overwrites the
 * current user's roles.
 */
const rolesInFlight = new Map<string, Promise<void>>();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  // The user whose roles should be held; async resolutions compare against
  // this before writing state, so stale fetches are discarded.
  const currentUserIdRef = useRef<string | null>(null);

  const fetchRoles = useCallback((userId: string): Promise<void> => {
    currentUserIdRef.current = userId;
    const inFlight = rolesInFlight.get(userId);
    if (inFlight) return inFlight;
    const query = (async () => {
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId);
      if (currentUserIdRef.current === userId) {
        setRoles((data || []).map(r => r.role as AppRole));
        setRolesLoading(false);
      }
    })();
    const safe = query.catch(() => {
      // Roles fetch failed: keep roles empty; the next auth event re-issues.
      if (currentUserIdRef.current === userId) setRolesLoading(false);
    });
    rolesInFlight.set(userId, safe);
    void safe.then(() => {
      if (rolesInFlight.get(userId) === safe) rolesInFlight.delete(userId);
    });
    return safe;
  }, []);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    const nextUser = nextSession?.user ?? null;
    setUser(nextUser);
    const prevUserId = currentUserIdRef.current;
    currentUserIdRef.current = nextUser?.id ?? null;
    if (nextUser) {
      // Ticket: any rider signed in is automatically online. 0-row no-op for
      // non-riders; fire-and-forget so presence never blocks auth UI.
      void markRiderOnlineByUserId(nextUser.id).catch(() => {});
      // Prewarm: the query flies while the root landing paints. setTimeout
      // keeps the auth-state path deadlock-free (per supabase guidance); the
      // dedupe map collapses concurrent callers into a single query.
      setTimeout(() => { void fetchRoles(nextUser.id); }, 0);
    } else {
      if (prevUserId) void markRiderOfflineByUserId(prevUserId).catch(() => {});
      setRoles([]);
      setRolesLoading(false);
    }
  }, [fetchRoles]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const currentId = currentUserIdRef.current;
    if (currentId) void markRiderOfflineByUserId(currentId).catch(() => {});
    await supabase.auth.signOut();
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  const rolesReady = !!user && !rolesLoading;

  return (
    <AuthContext.Provider value={{ user, session, roles, loading, rolesReady, signIn, signUp, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Test hook: clears the module-level in-flight map between test cases. */
export function _resetRolesInFlightForTesting() {
  rolesInFlight.clear();
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
