import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MapPin, Receipt, Truck } from "lucide-react";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { supabase } from "@/integrations/supabase/client";
import { getProductPublicUrl } from "@/lib/productImage";
import { usePrefersDark } from "@/hooks/usePrefersDark";

/**
 * Merchant funnel at /sell — Depop's Sell page translated. Sellers are
 * persuaded before the auth wall: outcome hero, honest trust tiles, three
 * simple steps, and real stores as proof (never invented sellers).
 */
export default function SellPage() {
  usePrefersDark();
  return (
    <StorefrontLayout>
      <div>
        {/* Outcome hero — same graphite as the shop, seller-facing copy */}
        <section aria-label="Sell on DeliveryAce" className="relative -mx-4 -mt-6 mb-10 overflow-hidden bg-[#1c1a17] text-[#f3efe8]">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(198,124,44,0.26),transparent_55%)]" />
            <div className="absolute inset-0 opacity-[0.14] [background-image:repeating-linear-gradient(115deg,transparent_0px,transparent_2px,rgba(255,255,255,0.16)_3px,transparent_4px)]" />
          </div>
          <div className="relative container mx-auto px-4 pt-12 pb-10 md:pt-16 md:pb-14">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#c9c2b4]">Sell on DeliveryAce</p>
              <h1 className="mt-3 font-display text-4xl md:text-6xl leading-[1.02] tracking-tight max-w-3xl">
                Turn your kitchen into orders.
              </h1>
              <p className="mt-3 max-w-xl text-[#d8d2c6] text-base md:text-lg">
                List what you sell. Riders deliver. Money settles the same day.
              </p>
              <Button asChild size="lg" className="mt-6 min-h-[44px]">
                <Link to="/auth?tab=signup">
                  Start selling <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              {/* Trust tiles — only claims the platform actually makes true */}
              <dl className="mt-8 flex flex-wrap gap-3">
                <div className="rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[150px]">
                  <dt className="flex items-center gap-1.5 text-xs text-[#c9c2b4]"><Truck className="h-3.5 w-3.5" aria-hidden="true" />No fleet needed</dt>
                  <dd className="text-sm font-medium">Riders are built in</dd>
                </div>
                <div className="rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[150px]">
                  <dt className="flex items-center gap-1.5 text-xs text-[#c9c2b4]"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />Tracked</dt>
                  <dd className="text-sm font-medium">Door to door</dd>
                </div>
                <div className="rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[150px]">
                  <dt className="flex items-center gap-1.5 text-xs text-[#c9c2b4]"><Receipt className="h-3.5 w-3.5" aria-hidden="true" />Same-day settlement</dt>
                  <dd className="text-sm font-medium">Money in, day of</dd>
                </div>
              </dl>
            </Reveal>
          </div>
        </section>

        {/* Selling is simple — three steps, mono numbers */}
        <section aria-label="Selling is simple" className="container mx-auto px-4 pb-14">
          <Reveal>
            <h2 className="font-display text-2xl md:text-3xl tracking-tight">Selling is simple</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
            <li className="rounded-xl border bg-card p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">01</p>
              <p className="mt-2 font-display text-xl">Open your store</p>
              <p className="mt-1 text-sm text-muted-foreground">Create an account and open your store with your business details.</p>
            </li>
            <li className="rounded-xl border bg-card p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">02</p>
              <p className="mt-2 font-display text-xl">List your products</p>
              <p className="mt-1 text-sm text-muted-foreground">Add photos, prices, and stock. Mark what is available today.</p>
            </li>
            <li className="rounded-xl border bg-card p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">03</p>
              <p className="mt-2 font-display text-xl">Orders come in</p>
              <p className="mt-1 text-sm text-muted-foreground">Riders deliver, and the money settles to you the same day.</p>
            </li>
            </ol>
          </Reveal>
        </section>

        <StoresProof />

        {/* Close band */}
        <section aria-label="Keep money local" className="container mx-auto px-4 py-14">
          <Reveal>
            <div className="rounded-2xl border bg-muted/40 p-8 md:p-10">
            <p className="font-display text-2xl md:text-3xl tracking-tight">Keep money local.</p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Your customers are already on this street. So are our riders.
            </p>
            <Button asChild className="mt-5 min-h-[44px] bg-foreground text-background hover:bg-foreground/90">
              <Link to="/auth?tab=signup">Start selling</Link>
            </Button>
            </div>
          </Reveal>
        </section>
      </div>
    </StorefrontLayout>
  );
}

interface ProofProduct {
  id: string;
  merchant_id: string;
  name: string;
  image_path: string | null;
  merchants?: { id: string; name: string } | null;
}

/** Real stores as social proof — the same strip pattern as the shop tiles. */
function StoresProof() {
  const [products, setProducts] = useState<ProofProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("products")
          .select("id,merchant_id,name,image_path,merchants(id,name)")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(24);
        if (!cancelled && data) setProducts(data as unknown as ProofProduct[]);
      } catch {
        // An empty proof section beats a broken page.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (products.length === 0) return null;

  const byMerchant = new Map<string, { name: string; thumbs: string[] }>();
  for (const p of products) {
    const m = p.merchants;
    if (!m) continue;
    const entry = byMerchant.get(m.id) ?? { name: m.name, thumbs: [] };
    const url = getProductPublicUrl(p.image_path);
    if (url && entry.thumbs.length < 4) entry.thumbs.push(url);
    byMerchant.set(m.id, entry);
  }
  const stores = Array.from(byMerchant.entries()).slice(0, 6);
  if (stores.length === 0) return null;

  return (
    <section aria-label="Meet the stores" className="container mx-auto px-4 pb-14">
      <Reveal>
        <h2 className="font-display text-2xl md:text-3xl tracking-tight">Meet the stores</h2>
        <p className="mt-1 text-sm text-muted-foreground">Already selling on DeliveryAce.</p>
      </Reveal>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map(([id, store]) => (
          <Link
            key={id}
            to={`/shop/m/${id}`}
            className="group rounded-xl border bg-card p-3 hover:shadow-md transition-shadow min-h-[44px]"
          >
            <div className="mb-2 flex h-20 overflow-hidden rounded-lg" aria-hidden="true">
              {store.thumbs.length > 0 ? (
                store.thumbs.map((url, i) => (
                  <img key={i} src={url} alt="" loading="lazy" className="h-full flex-1 object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]" />
                ))
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/40 font-display text-2xl text-muted-foreground">
                  {store.name.charAt(0)}
                </div>
              )}
            </div>
            <p className="font-semibold leading-tight truncate">{store.name}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-background">
              Visit store
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
