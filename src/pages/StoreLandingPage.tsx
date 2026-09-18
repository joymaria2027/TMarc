import { useEffect, useState } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Button } from "@/components/ui/button";
import { StoreIcon } from "lucide-react";

type State = { loading: boolean; ok: boolean; name?: string; reason?: string };

export default function StoreLandingPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [state, setState] = useState<State>({ loading: true, ok: false });

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,is_active,approval_status")
        .eq("id", merchantId)
        .maybeSingle();
      const m = data as any;
      if (!m) { setState({ loading: false, ok: false, reason: "We could not find this store." }); return; }
      if (m.approval_status !== "approved") {
        setState({ loading: false, ok: false, name: m.name, reason: "This store is still being reviewed and is not open yet." });
        return;
      }
      if (!m.is_active) {
        setState({ loading: false, ok: false, name: m.name, reason: "This store is currently closed." });
        return;
      }
      setState({ loading: false, ok: true, name: m.name });
    })();
  }, [merchantId]);

  if (state.loading) {
    return (
      <StorefrontLayout>
        <div role="status" aria-live="polite" aria-label="Opening store" className="max-w-md mx-auto py-16 space-y-4">
          <span className="sr-only">Opening store…</span>
          <div className="shimmer h-10 w-10 rounded-full mx-auto" aria-hidden="true" />
          <div className="shimmer h-8 rounded w-2/3 mx-auto" aria-hidden="true" />
          <div className="shimmer h-4 rounded w-1/2 mx-auto" aria-hidden="true" />
        </div>
      </StorefrontLayout>
    );
  }

  if (state.ok) return <Navigate to={`/shop/m/${merchantId}`} replace />;

  return (
    <StorefrontLayout>
      {/* Screen-reader announcement for the store outcome */}
      <div aria-live="polite" role="status" className="sr-only">
        {state.reason || "Store unavailable"}
      </div>
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <StoreIcon className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
        <h1 className="font-display text-3xl tracking-tight">{state.name || "Store unavailable"}</h1>
        <p role="status" className="text-muted-foreground">{state.reason}</p>
        <Button asChild><Link to="/shop">Browse other stores</Link></Button>
      </div>
    </StorefrontLayout>
  );
}
