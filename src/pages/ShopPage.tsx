import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductCard from "@/components/ProductCard";
import { getProductImageUrl, getProductPublicUrl } from "@/lib/productImage";
import { paginate, pageCount } from "@/lib/pagination";
import { useCart } from "@/lib/cart";
import { useWholesale } from "@/lib/wholesale";
import { toast } from "sonner";

const PAGE_SIZE = 12;

interface Product {
  id: string; merchant_id: string; name: string; description: string | null;
  price: number; quantity: number; track_inventory: boolean; available_today: boolean;
  image_path: string | null; image_paths?: string[] | null; category_id: string | null; created_at: string;
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
  const [page, setPage] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, m, bt, c] = await Promise.all([
        supabase.from("products")
          .select("id,merchant_id,name,description,price,quantity,track_inventory,available_today,image_path,image_paths,category_id,created_at,merchants(id,name,business_type_id)")
          .eq("approval_status", "approved").eq("is_active", true)
          .order("created_at", { ascending: false }),
        (supabase.from("merchants").select("id,name,business_type_id,address") as any).eq("is_active", true).eq("approval_status", "approved"),
        supabase.from("business_types").select("id,name").eq("is_active", true),
        supabase.from("product_categories").select("id,name,merchant_id"),
      ]);
      if (cancelled) return;
      const list = (p.data || []) as any as Product[];
      setProducts(list);
      setMerchants((m.data || []) as Merchant[]);
      setBusinessTypes((bt.data || []) as BusinessType[]);
      setCategories((c.data || []) as Category[]);

      // Populate public image URLs immediately so product cards display photos instantly without lag
      const initialUrls: Record<string, string> = {};
      for (const item of list) {
        const u = getProductPublicUrl(item.image_path);
        if (u) initialUrls[item.id] = u;
      }
      setImageUrls(initialUrls);
      setLoading(false);

      // Incremental render fallback for any non-public paths
      list.forEach(async item => {
        if (initialUrls[item.id]) return;
        const u = await getProductImageUrl(item.image_path);
        if (cancelled || !u) return;
        setImageUrls(prev => (prev[item.id] ? prev : { ...prev, [item.id]: u }));
      });
    })();
    return () => { cancelled = true; };
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

  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = paginate(filtered, safePage, PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, btFilter, catFilter, sort]);

  const handleAdd = (p: Product) => {
    const q = quote(p);
    add({ product_id: p.id, merchant_id: p.merchant_id, merchant_name: p.merchants?.name, name: p.name, price: q.price, quantity: q.isWholesale ? q.minQty : 1, image_path: p.image_path });
    toast.success("Added to cart");
    setAnnouncement(`${p.name} added to cart`);
  };

  // dedupe category names across merchants for the filter
  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of categories) if (!seen.has(c.name)) seen.set(c.name, c.id);
    return Array.from(seen.entries()).map(([name, id]) => ({ id, name }));
  }, [categories]);

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for cart + filtering */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Order from stores near you</h1>
          <p className="text-muted-foreground max-w-xl">
            Order from local stores. Pickup or delivery, tracked to your door.
          </p>
          {isWholesaler && (
            <Badge className="mt-1">Wholesale pricing active</Badge>
          )}
        </div>

        {merchantsWithProducts.length > 0 && (
          <section aria-label="Open stores near you" className="space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="font-display text-xl">Open near you</h2>
              <span className="text-xs text-muted-foreground" role="status">{merchantsWithProducts.length} open</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {merchantsWithProducts.map(m => (
                <Link key={m.id} to={`/shop/m/${m.id}`}
                  className="shrink-0 w-44 rounded-lg border bg-card p-3 hover:shadow-md transition-shadow min-h-[44px]">
                  <div className="h-16 w-16 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-2" aria-hidden="true">
                    <span className="font-display text-xl text-primary">{m.name.charAt(0)}</span>
                  </div>
                  <p className="font-semibold leading-tight truncate">{m.name}</p>
                  {m.address && <p className="text-xs text-muted-foreground truncate">{m.address}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <form role="search" aria-label="Search and filter products" className="flex flex-wrap gap-2 items-center" onSubmit={e => e.preventDefault()}>
          <div>
            <Label htmlFor="shop-search" className="sr-only">Search products or merchants</Label>
            <Input id="shop-search" type="search" placeholder="Search products or merchants…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="shop-bt-filter" className="sr-only">Filter by business type</Label>
            <Select value={btFilter} onValueChange={setBtFilter}>
              <SelectTrigger id="shop-bt-filter" className="w-44 h-11"><SelectValue placeholder="Business type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All business types</SelectItem>
                {businessTypes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="shop-cat-filter" className="sr-only">Filter by category</Label>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger id="shop-cat-filter" className="w-44 h-11"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="shop-sort" className="sr-only">Sort products</Label>
            <Select value={sort} onValueChange={v => setSort(v as Sort)}>
              <SelectTrigger id="shop-sort" className="w-44 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="price_asc">Price: low to high</SelectItem>
                <SelectItem value="price_desc">Price: high to low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>

        {loading ? (
          <div role="status" aria-live="polite" aria-label="Loading products" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <span className="sr-only">Loading products…</span>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card overflow-hidden" aria-hidden="true">
                <div className="shimmer w-full" style={{ aspectRatio: "4 / 3" }} />
                <div className="p-4 space-y-2">
                  <div className="shimmer h-4 rounded w-3/4" />
                  <div className="shimmer h-3 rounded w-1/2" />
                  <div className="shimmer h-9 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center space-y-2">
            <p role="status" className="font-medium">No products match those filters</p>
            <p className="text-sm text-muted-foreground">Try clearing the search or picking a different category. New stores open regularly.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setBtFilter("all"); setCatFilter("all"); setSort("newest"); }}>
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              Showing {visible.length} of {filtered.length} {filtered.length === 1 ? "product" : "products"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visible.map(p => {
                const q = quote(p);
                return (
                  <ProductCard
                    key={p.id}
                    product={p}
                    merchantName={p.merchants?.name}
                    imageUrl={imageUrls[p.id] ?? null}
                    quote={{ price: q.price, retailPrice: Number(p.price), isWholesale: q.isWholesale, minQty: q.minQty }}
                    canBuy={canBuy(p)}
                    onAdd={() => handleAdd(p)}
                  />
                );
              })}
            </div>
            {totalPages > 1 && (
              <nav aria-label="Product pages" className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                  Previous
                </Button>
                <span role="status" className="text-sm text-muted-foreground tabular-nums">
                  Page {safePage} of {totalPages}
                </span>
                <Button variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </StorefrontLayout>
  );
}
