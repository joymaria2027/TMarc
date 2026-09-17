import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getProductImageUrl } from "@/lib/productImage";
import { useCart } from "@/lib/cart";
import { useWholesale } from "@/lib/wholesale";
import { toast } from "sonner";

interface Product {
  id: string; merchant_id: string; name: string; description: string | null;
  price: number; quantity: number; track_inventory: boolean; available_today: boolean;
  image_path: string | null; category_id: string | null; created_at: string;
  merchants?: { id: string; name: string; business_type_id: string | null };
}
interface Merchant { id: string; name: string; business_type_id: string | null; address: string | null }
interface BusinessType { id: string; name: string }
interface Category { id: string; name: string; merchant_id: string }

type Sort = "newest" | "price_asc" | "price_desc";

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [btFilter, setBtFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  useEffect(() => {
    (async () => {
      const [p, m, bt, c] = await Promise.all([
        supabase.from("products")
          .select("id,merchant_id,name,description,price,quantity,track_inventory,available_today,image_path,category_id,created_at,merchants(id,name,business_type_id)")
          .eq("approval_status", "approved").eq("is_active", true)
          .order("created_at", { ascending: false }),
        (supabase.from("merchants").select("id,name,business_type_id,address") as any).eq("is_active", true).eq("approval_status", "approved"),
        supabase.from("business_types").select("id,name").eq("is_active", true),
        supabase.from("product_categories").select("id,name,merchant_id"),
      ]);
      const list = (p.data || []) as any as Product[];
      setProducts(list);
      setMerchants((m.data || []) as Merchant[]);
      setBusinessTypes((bt.data || []) as BusinessType[]);
      setCategories((c.data || []) as Category[]);
      setLoading(false);
      const urls: Record<string, string> = {};
      await Promise.all(list.map(async p => {
        const u = await getProductImageUrl(p.image_path);
        if (u) urls[p.id] = u;
      }));
      setImageUrls(urls);
    })();
  }, []);

  const merchantsWithProducts = useMemo(() => {
    const ids = new Set(products.map(p => p.merchant_id));
    return merchants.filter(m => ids.has(m.id));
  }, [products, merchants]);

  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const q = search.toLowerCase();
      if (q && !(p.name.toLowerCase().includes(q) || p.merchants?.name?.toLowerCase().includes(q))) return false;
      if (btFilter !== "all" && p.merchants?.business_type_id !== btFilter) return false;
      if (catFilter !== "all" && p.category_id !== catFilter) return false;
      return true;
    });
    if (sort === "price_asc") list = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    else if (sort === "price_desc") list = [...list].sort((a, b) => Number(b.price) - Number(a.price));
    return list;
  }, [products, search, btFilter, catFilter, sort]);

  const canBuy = (p: Product) =>
    p.available_today && (!p.track_inventory || p.quantity > 0);

  // dedupe category names across merchants for the filter
  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of categories) if (!seen.has(c.name)) seen.set(c.name, c.id);
    return Array.from(seen.entries()).map(([name, id]) => ({ id, name }));
  }, [categories]);

  return (
    <StorefrontLayout>
      <div className="space-y-8">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Marketplace</p>
          <h1 className="font-display text-4xl tracking-tight">Shop products</h1>
          {isWholesaler && (
            <Badge className="mt-1">Wholesale pricing active</Badge>
          )}
        </div>

        {merchantsWithProducts.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Browse by restaurant</h2>
              <span className="text-xs text-muted-foreground">{merchantsWithProducts.length} open</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {merchantsWithProducts.map(m => (
                <Link key={m.id} to={`/shop/m/${m.id}`}
                  className="shrink-0 w-44 rounded-lg border bg-card p-3 hover:shadow-md transition-shadow">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <span className="font-display text-xl text-primary">{m.name.charAt(0)}</span>
                  </div>
                  <p className="font-semibold leading-tight truncate">{m.name}</p>
                  {m.address && <p className="text-xs text-muted-foreground truncate">{m.address}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Search products or merchants…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={btFilter} onValueChange={setBtFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Business type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business types</SelectItem>
              {businessTypes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={v => setSort(v as Sort)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="price_asc">Price: low to high</SelectItem>
              <SelectItem value="price_desc">Price: high to low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">No products match your filters.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(p => (
              <Card key={p.id} className="overflow-hidden flex flex-col h-full">
                <Link to={`/shop/p/${p.id}`} className="block relative w-full bg-muted" style={{ aspectRatio: "4 / 3" }}>
                  {imageUrls[p.id] ? (
                    <img src={imageUrls[p.id]} alt={p.name} className="absolute inset-0 w-full h-full object-cover object-center" loading="lazy" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">No image</div>
                  )}
                </Link>
                <CardContent className="p-4 flex-1 flex flex-col gap-2">
                  <Link to={`/shop/m/${p.merchant_id}`} className="text-xs text-muted-foreground hover:underline truncate min-h-[1rem]">{p.merchants?.name}</Link>
                  <Link to={`/shop/p/${p.id}`}>
                    <h3 className="font-semibold leading-tight hover:underline line-clamp-2 min-h-[2.5rem]">{p.name}</h3>
                  </Link>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{p.description || ""}</p>
                  <div className="flex items-center justify-between pt-2 mt-auto">
                    <span className="font-display text-lg flex items-baseline gap-2">
                      D {quote(p).price.toFixed(2)}
                      {quote(p).isWholesale && (
                        <span className="text-xs text-muted-foreground line-through font-sans">D {Number(p.price).toFixed(2)}</span>
                      )}
                    </span>
                    {!p.available_today
                      ? <Badge variant="secondary">Closed today</Badge>
                      : p.track_inventory && p.quantity <= 0
                      ? <Badge variant="destructive">Out of stock</Badge>
                      : p.track_inventory
                      ? <Badge variant="outline">{p.quantity} in stock</Badge>
                      : null}
                  </div>
                  {quote(p).isWholesale && (
                    <p className="text-xs text-primary">Wholesale · min {quote(p).minQty}</p>
                  )}
                  <Button
                    size="sm" className="w-full" disabled={!canBuy(p)}
                    onClick={() => { add({ product_id: p.id, merchant_id: p.merchant_id, merchant_name: p.merchants?.name, name: p.name, price: quote(p).price, quantity: quote(p).isWholesale ? quote(p).minQty : 1, image_path: p.image_path }); toast.success("Added to cart"); }}
                  >Add to cart</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </StorefrontLayout>
  );
}
