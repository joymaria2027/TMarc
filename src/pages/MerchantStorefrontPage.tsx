import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/finance";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProductImageUrl } from "@/lib/productImage";
import { useCart } from "@/lib/cart";
import { useWholesale } from "@/lib/wholesale";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

interface Merchant {
  id: string; name: string; address: string | null; phone: string | null;
  business_types?: { name: string } | null;
}
interface Product {
  id: string; merchant_id: string; name: string; description: string | null;
  price: number; quantity: number; track_inventory: boolean; available_today: boolean;
  image_path: string | null; category_id: string | null;
}
interface Category { id: string; name: string; sort_order: number | null }

export default function MerchantStorefrontPage() {
  const { merchantId } = useParams<{ merchantId: string }>();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const [m, p, c] = await Promise.all([
        (supabase.from("merchants").select("id,name,address,phone,business_types(name)") as any).eq("id", merchantId).eq("is_active", true).eq("approval_status", "approved").maybeSingle(),
        supabase.from("products")
          .select("id,merchant_id,name,description,price,quantity,track_inventory,available_today,image_path,category_id")
          .eq("merchant_id", merchantId).eq("approval_status", "approved").eq("is_active", true)
          .order("name"),
        supabase.from("product_categories").select("id,name,sort_order").eq("merchant_id", merchantId).order("sort_order"),
      ]);
      setMerchant(m.data as any);
      const list = (p.data || []) as Product[];
      setProducts(list);
      setCategories((c.data || []) as Category[]);
      setLoading(false);
      // Signed URLs resolve through the shared cache (1h TTL).
      const u: Record<string, string> = {};
      await Promise.all(list.map(async pr => {
        const url = await getProductImageUrl(pr.image_path);
        if (url) u[pr.id] = url;
      }));
      setUrls(u);
    })();
  }, [merchantId]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; items: Product[] }>();
    map.set("__none__", { name: "Other", items: [] });
    for (const c of categories) map.set(c.id, { name: c.name, items: [] });
    for (const p of products) {
      const key = p.category_id && map.has(p.category_id) ? p.category_id : "__none__";
      map.get(key)!.items.push(p);
    }
    return Array.from(map.values()).filter(g => g.items.length > 0);
  }, [products, categories]);

  const canBuy = (p: Product) => p.available_today && (!p.track_inventory || p.quantity > 0);

  return (
    <StorefrontLayout>
      <div className="space-y-6">
        <Link to="/shop" className="text-sm text-muted-foreground hover:underline">← Back to all products</Link>
        {loading ? (
          <p className="text-muted-foreground" role="status">Loading store…</p>
        ) : !merchant ? (
          <p className="text-muted-foreground" role="status">Restaurant not found.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-4xl tracking-tight">{merchant.name}</h1>
                {merchant.business_types?.name && <Badge variant="outline" className="text-xs">{merchant.business_types.name}</Badge>}
                {isWholesaler && <Badge className="text-xs">Wholesale pricing</Badge>}
              </div>
              {merchant.address && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />{merchant.address}
                </p>
              )}
            </div>

            {grouped.length === 0 ? (
              <p className="text-muted-foreground" role="status">No products available yet. Check back soon.</p>
            ) : grouped.map(g => (
              <section key={g.name} aria-label={g.name} className="space-y-3">
                <h2 className="font-display text-2xl border-b pb-2">{g.name}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {g.items.map(p => (
                    <Card key={p.id} className="overflow-hidden flex flex-col h-full">
                      <Link to={`/shop/p/${p.id}`} aria-label={`View ${p.name}`} className="block relative w-full bg-muted" style={{ aspectRatio: "4 / 3" }}>
                        {urls[p.id]
                          ? <img src={urls[p.id]} alt={p.name} width={400} height={300} className="absolute inset-0 w-full h-full object-cover object-center" loading="lazy" />
                          : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">No image</div>}
                      </Link>
                      <CardContent className="p-4 flex-1 flex flex-col gap-2">
                        {/* Duplicate of the image link for sighted users; removed
                            from tab order so each card exposes a single link. */}
                        <Link to={`/shop/p/${p.id}`} tabIndex={-1}><h3 className="font-semibold leading-tight hover:underline line-clamp-2 min-h-[2.5rem]">{p.name}</h3></Link>
                        {p.description && <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{p.description}</p>}
                        <div className="flex items-center justify-between gap-2 pt-2 mt-auto">
                          <span className="font-display text-lg flex items-baseline gap-2 tabular-nums">
                            {formatMoney(quote(p).price)}
                            {quote(p).isWholesale && (
                              <span className="text-xs text-muted-foreground line-through tabular-nums">{formatMoney(Number(p.price))}</span>
                            )}
                          </span>
                          {!p.available_today
                            ? <Badge variant="secondary" className="text-xs">Closed</Badge>
                            : p.track_inventory && p.quantity <= 0
                            ? <Badge variant="destructive" className="text-xs">Out of stock</Badge>
                            : null}
                        </div>
                        <Button size="sm" className="w-full" disabled={!canBuy(p)}
                          onClick={() => { add({ product_id: p.id, merchant_id: p.merchant_id, merchant_name: merchant.name, name: p.name, price: quote(p).price, quantity: quote(p).isWholesale ? quote(p).minQty : 1, image_path: p.image_path }); toast.success("Added to cart"); }}>
                          Add to cart
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </StorefrontLayout>
  );
}
