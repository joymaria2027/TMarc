import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/finance";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProductImageUrl } from "@/lib/productImage";
import { useCart } from "@/lib/cart";
import { useWholesale } from "@/lib/wholesale";
import { toast } from "sonner";
import { Package } from "lucide-react";

interface Product {
  id: string; merchant_id: string; name: string; description: string | null;
  price: number; quantity: number; track_inventory: boolean; available_today: boolean;
  image_path: string | null;
  merchants?: { id: string; name: string; address: string | null } | null;
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  useEffect(() => {
    if (!productId) return;
    (async () => {
      const { data } = await supabase.from("products")
        .select("id,merchant_id,name,description,price,quantity,track_inventory,available_today,image_path,merchants(id,name,address)")
        .eq("id", productId).eq("approval_status", "approved").eq("is_active", true)
        .maybeSingle();
      setProduct(data as any);
      setLoading(false);
      if (data?.image_path) setImgUrl(await getProductImageUrl(data.image_path));
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
          <div className="aspect-square bg-muted rounded-lg overflow-hidden">
            {imgUrl
              ? <img src={imgUrl} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <Package className="h-8 w-8" aria-hidden="true" />
                  <span className="text-xs">No image available</span>
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
