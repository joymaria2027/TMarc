import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Index from "@/pages/Index";
import LandingPage from "@/pages/LandingPage";

/**
 * Root route: content-first cold start (.scratch/cold-start-content-first).
 *
 * The landing page is static markup, so it renders immediately — before the
 * Supabase session resolves. No spinner on first paint. When a session
 * materializes we swap in the role dashboard; signing out falls back to the
 * landing page. The dashboard gates auth itself (Index.tsx), so identity is
 * only checked where it matters.
 */
export default function RootRoute() {
  const { user } = useAuth();
  return user ? <Layout><Index /></Layout> : <LandingPage />;
}
