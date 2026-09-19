import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Index from "@/pages/Index";
import LandingPage from "@/pages/LandingPage";

/**
 * Root route: content-first cold start (.scratch/cold-start-content-first,
 * prewarm-roles-swap-in).
 *
 * The landing page is static markup, so it renders immediately — before the
 * Supabase session resolves. No spinner on first paint. The roles query is
 * prewarmed under this paint (useAuth), and the swap to the role dashboard
 * waits for `rolesReady` so the dashboard mounts with its data. Signing out
 * falls back to the landing page.
 */
export default function RootRoute() {
  const { user, rolesReady } = useAuth();
  return user && rolesReady ? <Layout><Index /></Layout> : <LandingPage />;
}
