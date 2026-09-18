import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/finance";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProductImageUrl, getProductPublicUrl } from "@/lib/productImage";
import { useCart } from "@/lib/cart";
import { useWholesale } from "@/lib/wholesale";
import { toast } from "sonner";
import { Package, ChevronLeft, ChevronRight } from "lucide-react";

interface Product {
  id: string; merchant_id: string; name: string; description: string | null;
  price: number; quantity: number; track_inventory: boolean; available_today: boolean;
  image_path: string | null; image_paths?: string[] | null;
  merchants?: { id: string; name: string; address: string | null } | null;
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const { data } = await supabase.from("products")
        .select("id,merchant_id,name,description,price,quantity,track_inventory,available_today,image_path,image_paths,merchants(id,name,address)")
        .eq("id", productId).eq("approval_status", "approved").eq("is_active", true)
        .maybeSingle();
      setProduct(data as any);

      const paths: string[] = (data as any)?.image_paths?.length
        ? (data as any).image_paths
        : data?.image_path ? [data.image_path] : [];

      const urls = paths.map(p => getProductPublicUrl(p)).filter(Boolean) as string[];
      setImageUrls(urls);
      setActiveIdx(0);
      setLoading(false);
    })();
  }, [productId]);

  if (loading) return (
    <StorefrontLayout>
      <div role="status" aria-live="polite" aria-label="Loading product" className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8">
        <span className="sr-only">Loading product…</span>
        <div className="shimmer aspect-square rounded-lg" aria-hidden="true" />
        <div className="space-y-3" aria-hidden="true">
          <div className="shimmer h-8 rounded w-2/3" />
          <div className="shimmer h-6 rounded w-1/3" />
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
  const q = quote(product);
  const effQty = Math.max(qty, q.isWholesale ? q.minQty : 1);
  const unitPrice = q.isWholesale && effQty >= q.minQty ? q.price : Number(product.price);

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for cart updates */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-5xl mx-auto space-y-4">
        <Link to={`/shop/m/${product.merchant_id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline min-h-[44px]">
          <span aria-hidden="true">←</span> Back to {product.merchants?.name}
        </Link>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <div className="aspect-square bg-muted/40 rounded-xl overflow-hidden relative flex items-center justify-center border shadow-xs group">
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
                    className="relative max-w-full max-h-full object-contain p-4 select-none"
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
                    className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all p-0.5 bg-muted/20 ${
                      idx === activeIdx
                        ? "border-primary ring-2 ring-primary/20 shadow-xs scale-102"
                        : "border-border/60 hover:border-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={url} alt="" aria-hidden="true" className="w-full h-full object-contain rounded" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4 min-w-0">
            <Link to={`/shop/m/${product.merchant_id}`} className="text-sm text-muted-foreground hover:underline truncate block">{product.merchants?.name}</Link>
            <h1 className="font-display text-3xl tracking-tight break-words">{product.name}</h1>
            {q.isWholesale ? (
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
            {product.description && <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{product.description}</p>}
            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <Label htmlFor="pdp-quantity">Quantity</Label>
              <Input id="pdp-quantity" type="number" min={q.isWholesale ? q.minQty : 1} max={product.track_inventory ? product.quantity : undefined}
                value={effQty} onChange={e => setQty(Math.max(q.isWholesale ? q.minQty : 1, parseInt(e.target.value) || 1))}
                className="w-24" aria-describedby={q.isWholesale ? "pdp-wholesale-min" : undefined} />
            </div>
            <Button size="lg" disabled={!canBuy} aria-label={`Add ${effQty} ${product.name} to cart`}
              onClick={() => { add({ product_id: product.id, merchant_id: product.merchant_id, merchant_name: product.merchants?.name, name: product.name, price: unitPrice, quantity: effQty, image_path: product.image_path }); toast.success("Added to cart"); setAnnouncement(`${effQty} ${product.name} added to cart`); }}>
              Add {effQty} to cart
            </Button>
          </div>
        </div>
      </div>
    </StorefrontLayout>
  );
}
