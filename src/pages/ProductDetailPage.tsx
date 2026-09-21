import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/finance";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProductPublicUrl } from "@/lib/productImage";
import { useCart } from "@/lib/cart";
import { useWholesale, type WholesaleQuote } from "@/lib/wholesale";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Package } from "lucide-react";

/**
 * Product detail page in Icebug's PDP grammar: a tall scroll gallery on the
 * left, a sticky buy panel on the right with a variant radio (STANDARD vs
 * WHOLESALE price — our honest take on their stud options), mono accordion
 * specs, a "more from this store" rail, and a promise band. Sections without
 * real data self-hide: no reviews, no size guide, no fabricated imagery.
 */

interface Product {
  id: string; merchant_id: string; name: string; description: string | null;
  price: number; quantity: number; track_inventory: boolean; available_today: boolean;
  image_path: string | null; image_paths?: string[] | null;
  merchants?: { id: string; name: string; address: string | null } | null;
}

interface Sibling {
  id: string; name: string; price: number;
  image_path: string | null; image_paths?: string[] | null;
}

/** Mono accordion row in the buy panel — Icebug's INSULATION/COMPARE grammar. */
function Spec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-y border-border/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`spec-${id}`}
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between py-3 text-left font-mono text-[11px] uppercase tracking-widest text-foreground/80 hover:text-foreground min-h-[44px]"
      >
        {title}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={`spec-${id}`} role="region" aria-label={`${title} details`} className="pb-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [buyRetail, setBuyRetail] = useState(false);
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("products")
        .select("id,merchant_id,name,description,price,quantity,track_inventory,available_today,image_path,image_paths,merchants(id,name,address)")
        .eq("id", productId).eq("approval_status", "approved").eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      const row = data as Product | null;
      setProduct(row);

      const paths: string[] = row?.image_paths?.length
        ? row.image_paths
        : row?.image_path ? [row.image_path] : [];

      setImageUrls(paths.map(p => getProductPublicUrl(p)).filter(Boolean) as string[]);
      setActiveIdx(0);
      setQty(1);
      setBuyRetail(false);
      setLoading(false);

      // Siblings for the "more from this store" rail (exclude the viewed
      // product; stable order; self-hides when the store has nothing else).
      const merchantId = row?.merchant_id;
      if (merchantId) {
        const { data: sib } = await supabase.from("products")
          .select("id,name,price,image_path,image_paths")
          .eq("merchant_id", merchantId).eq("approval_status", "approved").eq("is_active", true)
          .neq("id", productId)
          .order("price", { ascending: true })
          .limit(6);
        if (!cancelled) setSiblings((sib as Sibling[]) ?? []);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  // A wholesale-eligible buyer starts on the wholesale variant; everyone
  // else sees no variant radio at all.
  useEffect(() => {
    setBuyRetail(false);
  }, [isWholesaler, productId]);

  const q: WholesaleQuote = product ? quote(product) : { price: 0, retailPrice: 0, minQty: 1, isWholesale: false };
  const showVariant = q.isWholesale && isWholesaler;
  const buyWholesale = showVariant && !buyRetail;
  const minQty = buyWholesale ? q.minQty : 1;
  const effQty = Math.max(qty, minQty);
  const unitPrice = buyWholesale && effQty >= q.minQty ? q.price : Number(product?.price ?? 0);

  const siblingsWithImages = useMemo(
    () => siblings.map(s => ({ ...s, url: s.image_paths?.length ? getProductPublicUrl(s.image_paths[0]) : getProductPublicUrl(s.image_path) })),
    [siblings]
  );

  if (loading) return (
    <StorefrontLayout>
      <div role="status" aria-live="polite" aria-label="Loading product" className="max-w-6xl mx-auto grid md:grid-cols-[1.5fr_1fr] gap-10">
        <span className="sr-only">Loading product…</span>
        <div className="shimmer aspect-[4/5] rounded-lg" aria-hidden="true" />
        <div className="space-y-3 md:sticky md:top-24 self-start" aria-hidden="true">
          <div className="shimmer h-4 rounded w-1/3" />
          <div className="shimmer h-9 rounded w-2/3" />
          <div className="shimmer h-8 rounded w-1/2" />
          <div className="shimmer h-11 rounded w-full" />
        </div>
      </div>
    </StorefrontLayout>
  );
  if (!product) return (
    <StorefrontLayout>
      <div className="max-w-md mx-auto rounded-lg border bg-card p-8 text-center space-y-2">
        <p role="status" className="font-medium">Product not found</p>
        <p className="text-sm text-muted-foreground">It may have sold out, or the link is out of date.</p>
        <Button asChild><Link to="/shop">Browse stores</Link></Button>
      </div>
    </StorefrontLayout>
  );

  const canBuy = product.available_today && (!product.track_inventory || product.quantity > 0);

  const addToCart = () => {
    add({
      product_id: product.id, merchant_id: product.merchant_id, merchant_name: product.merchants?.name,
      name: product.name, price: unitPrice, quantity: effQty, image_path: product.image_path,
      // Flag the line when a wholesale-eligible buyer deliberately chose the
      // standard price, so cart minimum validation leaves it alone.
      ...(showVariant && buyRetail ? { pricingMode: "retail" as const } : {}),
    });
    toast.success("Added to cart");
    setAnnouncement(`${effQty} ${product.name} added to cart`);
  };

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for cart updates */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-6xl mx-auto space-y-14">
        <Link to={`/shop/m/${product.merchant_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline min-h-[44px]">
          <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Back to {product.merchants?.name}
        </Link>

        <div className="grid md:grid-cols-[1.5fr_1fr] gap-10 items-start">
          {/* Gallery — tall, edge-to-edge feel, fills the left column */}
          <div role="region" aria-label="Product gallery" className="space-y-3">
            <div className="aspect-[4/5] bg-muted/40 overflow-hidden relative flex items-center justify-center border shadow-xs group">
              {imageUrls.length > 0 ? (
                <>
                  <img
                    src={imageUrls[activeIdx]}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-125 pointer-events-none transition-all duration-300"
                  />
                  <img
                    src={imageUrls[activeIdx]}
                    alt={`${product.name} - view ${activeIdx + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="relative max-w-full max-h-full object-contain p-6 select-none"
                  />

                  {imageUrls.length > 1 && (
                    <>
                      <div className="absolute top-3 right-3 z-10">
                        <Badge variant="secondary" className="bg-background/80 backdrop-blur-md shadow-xs text-xs font-mono">
                          {activeIdx + 1} / {imageUrls.length}
                        </Badge>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="Previous image"
                        onClick={() => setActiveIdx((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1))}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/85 backdrop-blur-md shadow-md hover:bg-background opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label="Next image"
                        onClick={() => setActiveIdx((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/85 backdrop-blur-md shadow-md hover:bg-background opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <Package className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
                  <span className="text-xs">No image available</span>
                </div>
              )}
            </div>

            {imageUrls.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin" role="tablist" aria-label="Product image thumbnails">
                {imageUrls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIdx}
                    aria-label={`View photo ${idx + 1}`}
                    onClick={() => setActiveIdx(idx)}
                    className={`relative flex-shrink-0 w-16 h-16 overflow-hidden border-2 transition-all p-0.5 bg-muted/20 rounded-none ${
                      idx === activeIdx
                        ? "border-foreground ring-1 ring-foreground/20"
                        : "border-border/60 hover:border-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={url} alt="" aria-hidden="true" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Buy panel — sticky while the gallery scrolls */}
          <div role="region" aria-label="Buy panel" className="space-y-5 md:sticky md:top-24">
            <div className="space-y-1">
              {product.available_today && (
                <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">In stores today</p>
              )}
              <Link to={`/shop/m/${product.merchant_id}`} className="text-sm text-muted-foreground hover:underline underline-offset-4 inline-flex items-center gap-1">
                {product.merchants?.name} <span aria-hidden="true">→</span>
              </Link>
            </div>
            <h1 className="font-display text-3xl tracking-tight break-words">{product.name}</h1>

            {buyWholesale ? (
              <div className="space-y-1">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <p className="font-display text-3xl tabular-nums">{formatMoney(q.price)}</p>
                  <p className="text-base text-muted-foreground line-through tabular-nums">{formatMoney(q.retailPrice)}</p>
                  <Badge>Wholesale</Badge>
                </div>
                <p id="pdp-wholesale-min" className="text-xs text-muted-foreground">Minimum {q.minQty} unit{q.minQty > 1 ? "s" : ""} for this price.</p>
              </div>
            ) : (
              <p className="font-display text-3xl tabular-nums">{formatMoney(Number(product.price))}</p>
            )}

            <div>
              {!product.available_today
                ? <Badge variant="secondary">Closed today</Badge>
                : product.track_inventory && product.quantity <= 0
                ? <Badge variant="destructive">Out of stock</Badge>
                : product.track_inventory
                ? <Badge variant="outline">{product.quantity} in stock</Badge>
                : <Badge variant="outline">Available</Badge>}
            </div>

            {isWholesaler && !q.isWholesale && (
              <p className="text-xs text-muted-foreground">No wholesale price set for this item yet.</p>
            )}

            {/* Variant radio — our honest take on Icebug's WITH/WITHOUT STUDS */}
            {showVariant && (
              <fieldset className="border-y border-border/60 py-3">
                <legend className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground pb-2">Price</legend>
                <div className="grid grid-cols-2 border border-border divide-x">
                  <label className={`flex cursor-pointer items-center justify-center gap-2 px-2 py-2.5 font-mono text-[11px] uppercase tracking-widest min-h-[44px] ${buyRetail ? "bg-muted/40 text-muted-foreground" : "bg-foreground text-background"}`}>
                    <input type="radio" name="pdp-pricing" className="sr-only" checked={buyRetail} onChange={() => setBuyRetail(true)} />
                    Standard price
                  </label>
                  <label className={`flex cursor-pointer items-center justify-center gap-2 px-2 py-2.5 font-mono text-[11px] uppercase tracking-widest min-h-[44px] ${buyRetail ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground"}`}>
                    <input type="radio" name="pdp-pricing" className="sr-only" checked={!buyRetail} onChange={() => setBuyRetail(false)} />
                    Wholesale price
                  </label>
                </div>
              </fieldset>
            )}

            {product.description && <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{product.description}</p>}

            <div className="flex items-center gap-3 flex-wrap">
              <Label htmlFor="pdp-quantity">Quantity</Label>
              <Input id="pdp-quantity" type="number" min={minQty} max={product.track_inventory ? product.quantity : undefined}
                value={effQty} onChange={e => setQty(Math.max(minQty, parseInt(e.target.value) || minQty))}
                className="w-24" aria-describedby={buyWholesale ? "pdp-wholesale-min" : undefined} />
            </div>
            <Button size="lg" className="w-full" disabled={!canBuy} aria-label={`Add ${effQty} ${product.name} to cart`} onClick={addToCart}>
              Add {effQty} to cart
            </Button>

            {/* Spec accordions — nothing invented, only what the platform truly does */}
            <div className="pt-2">
              <Spec id="delivery" title="Delivery">
                Rider delivery is GPS-tracked, door to door. Orders placed today are delivered the same day, and merchants are settled the same day the money is earned.
              </Spec>
              <Spec id="stock" title="Stock">
                {product.track_inventory
                  ? `${product.quantity} unit${product.quantity === 1 ? "" : "s"} in stock at ${product.merchants?.name ?? "the store"} right now.`
                  : `Availability is confirmed by ${product.merchants?.name ?? "the store"} when your order is accepted.`}
              </Spec>
              <Spec id="store" title="Store details">
                {product.merchants?.name}
                {product.merchants?.address ? <> — {product.merchants.address}</> : null}.{" "}
                <Link to={`/shop/m/${product.merchant_id}`} className="underline underline-offset-4 hover:text-foreground">See everything this store sells</Link>.
              </Spec>
            </div>
          </div>
        </div>

        {/* More from this store — Icebug rail grammar; self-hides when empty */}
        {siblingsWithImages.length > 0 && (
          <section role="region" aria-label={`More from ${product.merchants?.name ?? "this store"}`} className="space-y-4">
            <div className="flex items-end justify-between border-b border-border pb-2">
              <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                More from {product.merchants?.name ?? "this store"}
              </h2>
              <Link to={`/shop/m/${product.merchant_id}`} className="font-mono text-[11px] uppercase tracking-widest underline underline-offset-4 hover:text-foreground">
                Shop all
              </Link>
            </div>
            <div className="flex gap-0 overflow-x-auto scrollbar-thin snap-x snap-mandatory">
              {siblingsWithImages.map((s, i) => (
                <Link key={s.id} to={`/shop/p/${s.id}`}
                  className={`group relative min-w-[220px] flex-1 snap-start border-border ${i > 0 ? "border-l" : ""} ${i >= 4 ? "hidden xl:block" : ""}`}>
                  <div className="aspect-square overflow-hidden bg-muted/30">
                    {s.url && (
                      <img src={s.url} alt="" aria-hidden="true" loading="lazy" decoding="async"
                        className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105" />
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-2 px-3 py-2.5">
                    <span className="truncate text-sm">{s.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatMoney(Number(s.price))}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Promise band — same promise the landing makes, thin-bordered */}
        <section role="region" aria-label="Our promise" className="border-y border-border py-10 grid md:grid-cols-2 gap-6 items-center">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Our promise to you</p>
            <p className="font-display text-2xl leading-snug">Fair fees. Live tracking. Money settled the day it&apos;s earned.</p>
          </div>
          <div className="md:justify-self-end">
            <Link to="/" className="font-mono text-[11px] uppercase tracking-widest underline underline-offset-4 hover:text-foreground">
              Read our promise
            </Link>
          </div>
        </section>
      </div>
    </StorefrontLayout>
  );
}
