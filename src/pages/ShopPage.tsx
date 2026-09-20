import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, Plus, ShoppingBag, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import StorefrontLayout from "@/components/StorefrontLayout";
import FirstRunHint from "@/components/FirstRunHint";
import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductCard from "@/components/ProductCard";
import { getProductImageUrl, getProductPublicUrl } from "@/lib/productImage";
import { paginate, pageCount } from "@/lib/pagination";
import { useCart } from "@/lib/cart";
import { useWholesale } from "@/lib/wholesale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PAGE_SIZE = 12;
const JUST_ADDED_COUNT = 8;
const PRICE_CAPS = [25, 50, 100, 250] as const;

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

function freshLabel(createdAt: string): string | null {
  const age = Date.now() - new Date(createdAt).getTime();
  if (age < 24 * 3600_000) return "Added today";
  if (age < 7 * 24 * 3600_000) return "This week";
  return null;
}

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [btFilter, setBtFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [announcement, setAnnouncement] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const { add } = useCart();
  const { isWholesaler, quote } = useWholesale();

  // Global header search lands here as ?q= — adopt it as the initial filter.
  const qParam = searchParams.get("q") ?? "";
  const [qAdopted, setQAdopted] = useState(false);
  useEffect(() => {
    if (qAdopted || loading) return;
    if (qParam) {
      setSearch(qParam);
      setQAdopted(true);
      // Clean the URL so a manual clear of the input isn't re-adopted on refresh.
      setSearchParams({}, { replace: true });
    }
  }, [qAdopted, loading, qParam, setSearchParams]);

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
      if (maxPrice != null && Number(p.price) > maxPrice) return false;
      return true;
    });
    if (sort === "price_asc") list = [...list].sort((a, b) => Number(a.price) - Number(b.price));
    else if (sort === "price_desc") list = [...list].sort((a, b) => Number(b.price) - Number(a.price));
    return list;
  }, [products, search, btFilter, catFilter, maxPrice, sort]);

  const justAdded = useMemo(
    () => products.slice(0, JUST_ADDED_COUNT),
    [products]
  );

  // Depop-style category tiles: deduped by name, only ones that actually have
  // products. Photo card (newest image in the category) when imagery exists.
  const categoryTiles = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of categories) if (!seen.has(c.name)) seen.set(c.name, c.id);
    const newestByCategory = new Map<string, Product>();
    for (const p of products) {
      if (p.category_id && !newestByCategory.has(p.category_id)) newestByCategory.set(p.category_id, p);
    }
    return Array.from(seen.entries())
      .filter(([, id]) => newestByCategory.has(id))
      .map(([name, id]) => ({ id, name, imageUrl: imageUrls[newestByCategory.get(id)!.id] ?? null }));
  }, [categories, products, imageUrls]);

  // Per-merchant product thumbnails for the store tiles (Depop's brand strips).
  const merchantThumbs = useMemo(() => {
    const byMerchant = new Map<string, string[]>();
    for (const p of products) {
      const url = imageUrls[p.id];
      if (!url) continue;
      const list = byMerchant.get(p.merchant_id) ?? [];
      if (list.length < 4) list.push(url);
      byMerchant.set(p.merchant_id, list);
    }
    return byMerchant;
  }, [products, imageUrls]);

  const canBuy = (p: Product) =>
    p.available_today && (!p.track_inventory || p.quantity > 0);

  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const visible = paginate(filtered, safePage, PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, btFilter, catFilter, maxPrice, sort]);

  const scrollToGrid = () => {
    document.getElementById("all-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setCap = (cap: number) => {
    setMaxPrice(prev => (prev === cap ? null : cap));
    scrollToGrid();
  };

  const clearFilters = () => {
    setSearch("");
    setBtFilter("all");
    setCatFilter("all");
    setMaxPrice(null);
    setSort("newest");
  };

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

  const filtersActive = search !== "" || btFilter !== "all" || catFilter !== "all" || maxPrice != null || sort !== "newest";

  const productCount = products.length;

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for cart + filtering */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>

      {/* Full-bleed split hero — Depop's Men|Women panels: two visitor types, two doors */}
      <section aria-label="Shop highlights" className="relative -mx-4 -mt-6 mb-8 overflow-hidden bg-[#1c1a17] text-[#f3efe8]">
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(198,124,44,0.28),transparent_55%)]" />
          <div className="absolute inset-0 opacity-[0.14] [background-image:repeating-linear-gradient(115deg,transparent_0px,transparent_2px,rgba(255,255,255,0.16)_3px,transparent_4px)]" />
        </div>
        <div className="relative container mx-auto px-4 pt-12 pb-10 md:pt-16 md:pb-14">
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 md:gap-0 items-center">
            {/* Left panel — the locked customer contract */}
            <div>
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.02] tracking-tight max-w-2xl">
                Order from stores near you.
              </h1>
              <p className="mt-3 max-w-xl text-[#d8d2c6] text-base md:text-lg">
                Order from local stores. Pickup or delivery, tracked to your door.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={scrollToGrid} className="min-h-[44px]">
                  Start shopping <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
                {isWholesaler && <Badge className="bg-[#f3efe8] text-[#1c1a17] hover:bg-[#f3efe8]">Wholesale pricing active</Badge>}
              </div>
              {/* Stat tiles — only numbers the catalog can honestly produce, plus the platform trust tile */}
              <dl className="mt-8 flex flex-wrap gap-3">
                {merchantsWithProducts.length > 0 && (
                  <div className="rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[120px]">
                    <dt className="flex items-center gap-1.5 text-xs text-[#c9c2b4]"><ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />Stores open</dt>
                    <dd className="font-display text-2xl tabular-nums">{merchantsWithProducts.length}</dd>
                  </div>
                )}
                {productCount > 0 && (
                  <div className="rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[120px]">
                    <dt className="flex items-center gap-1.5 text-xs text-[#c9c2b4]"><Plus className="h-3.5 w-3.5" aria-hidden="true" />Items live</dt>
                    <dd className="font-display text-2xl tabular-nums">{productCount}</dd>
                  </div>
                )}
                <div className="rounded-lg bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[120px]">
                  <dt className="flex items-center gap-1.5 text-xs text-[#c9c2b4]"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Tracked delivery</dt>
                  <dd className="text-sm font-medium">Door to door</dd>
                </div>
              </dl>
              {!loading && <FirstRunHint audience="storefront" />}
            </div>
            {/* Divider */}
            <div aria-hidden="true" className="hidden md:block h-48 w-px bg-white/15" />
            {/* Right panel — the wholesale door (Depop's second photo panel) */}
            <div className="md:pl-10">
              <p className="text-xs uppercase tracking-[0.2em] text-[#c9c2b4]">Buying for a business?</p>
              <p className="mt-2 font-display text-3xl md:text-4xl leading-tight">Wholesale,<br />at real prices.</p>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="mt-5 min-h-[44px] border-[#f3efe8] bg-[#f3efe8] text-[#1c1a17] hover:bg-[#f3efe8]/90 hover:text-[#1c1a17]"
              >
                <Link to="/wholesale">See wholesale prices</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Statement break — Depop's "Buy for less. Sell for free." moment */}
      <section aria-label="Keep money local" className="py-8 text-center space-y-4">
        <p className="font-display text-2xl md:text-3xl tracking-tight max-w-3xl mx-auto">
          Order from your street. Sell to your street. Keep money local.
        </p>
        <Button asChild variant="outline" className="bg-foreground text-background hover:bg-foreground/90 min-h-[44px]">
          <Link to="/sell">Start selling</Link>
        </Button>
      </section>

      <div className="space-y-10">
        {justAdded.length > 0 && (
          <section aria-label="Just added" className="space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="font-display text-2xl">Just added</h2>
              <span className="text-xs text-muted-foreground">Fresh from local kitchens and shelves</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
              {justAdded.map(p => {
                const fresh = freshLabel(p.created_at);
                return (
                  <Link key={p.id} to={`/shop/p/${p.id}`} className="group shrink-0 w-40 snap-start">
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted/60">
                      {imageUrls[p.id] ? (
                        <img src={imageUrls[p.id]} alt="" aria-hidden="true" loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image yet</div>
                      )}
                      {fresh && (
                        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{fresh}</span>
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.merchants?.name}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {categoryTiles.length > 0 && (
          <section aria-label="Shop by category" className="space-y-3">
            <h2 className="font-display text-2xl">What are you after?</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {categoryTiles.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCatFilter(prev => (prev === c.id ? "all" : c.id)); scrollToGrid(); }}
                  aria-pressed={catFilter === c.id}
                  className={cn(
                    "group relative min-h-[44px] overflow-hidden rounded-xl border text-left",
                    catFilter === c.id ? "border-primary ring-2 ring-primary" : "border-border hover:border-foreground/40"
                  )}
                >
                  {c.imageUrl ? (
                    <>
                      <img src={c.imageUrl} alt="" aria-hidden="true" loading="lazy" className="h-20 w-36 object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]" />
                      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <span className="absolute bottom-1.5 left-2.5 text-sm font-semibold text-white drop-shadow">{c.name}</span>
                    </>
                  ) : (
                    <span className="inline-flex px-4 py-2 text-sm font-medium">{c.name}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {merchantsWithProducts.length > 0 && (
          <section aria-label="Open stores near you" className="space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="font-display text-2xl">Open near you</h2>
              <span className="text-xs text-muted-foreground" role="status">{merchantsWithProducts.length} open</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {merchantsWithProducts.map(m => (
                <Link key={m.id} to={`/shop/m/${m.id}`}
                  className="group shrink-0 w-48 rounded-xl border bg-card p-3 hover:shadow-md transition-shadow min-h-[44px]">
                  {(merchantThumbs.get(m.id) ?? []).length > 0 ? (
                    <div className="mb-2 flex h-16 overflow-hidden rounded-lg" aria-hidden="true">
                      {(merchantThumbs.get(m.id) ?? []).map((url, i) => (
                        <img key={i} src={url} alt="" loading="lazy" className="h-full flex-1 object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04]" />
                      ))}
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-2" aria-hidden="true">
                      <span className="font-display text-xl text-primary">{m.name.charAt(0)}</span>
                    </div>
                  )}
                  <p className="font-semibold leading-tight truncate">{m.name}</p>
                  {m.address && <p className="text-xs text-muted-foreground truncate">{m.address}</p>}
                  <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-background">
                    Visit <Plus className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section aria-label="Shop by price" className="space-y-3">
          <h2 className="font-display text-2xl">Shop by price</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Filter by maximum price">
            {PRICE_CAPS.map(cap => (
              <button
                key={cap}
                type="button"
                onClick={() => setCap(cap)}
                aria-pressed={maxPrice === cap}
                className={cn(
                  "min-h-[72px] rounded-xl border px-4 py-4 text-center transition-colors",
                  maxPrice === cap
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 hover:bg-muted"
                )}
              >
                <span className="font-display text-xl md:text-2xl tabular-nums">Under D{cap}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="All products" id="all-products" className="space-y-4 scroll-mt-20">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="font-display text-2xl">All products</h2>
            <form role="search" aria-label="Search and filter products" className="flex flex-wrap gap-2 items-center" onSubmit={e => e.preventDefault()}>
              <div>
                <label htmlFor="shop-search" className="sr-only">Search products or merchants</label>
                <Input id="shop-search" type="search" placeholder="Search products or merchants…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-11" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="shop-bt-filter" className="sr-only">Filter by business type</label>
                <Select value={btFilter} onValueChange={setBtFilter}>
                  <SelectTrigger id="shop-bt-filter" className="w-44 h-11"><SelectValue placeholder="Business type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All business types</SelectItem>
                    {businessTypes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="shop-cat-filter" className="sr-only">Filter by category</label>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger id="shop-cat-filter" className="w-44 h-11"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categoryOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="shop-sort" className="sr-only">Sort products</label>
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
          </div>

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
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <>
              <p role="status" className="text-sm text-muted-foreground">
                Showing {visible.length} of {filtered.length} {filtered.length === 1 ? "product" : "products"}
                {maxPrice != null && <> under D{maxPrice}</>}
              </p>
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  Clear filters
                </Button>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visible.map((p, i) => {
                  const q = quote(p);
                  return (
                    <Reveal key={p.id} delay={Math.min(i, 11) * 0.04}>
                      <ProductCard
                        product={p}
                        merchantName={p.merchants?.name}
                        imageUrl={imageUrls[p.id] ?? null}
                        quote={{ price: q.price, retailPrice: Number(p.price), isWholesale: q.isWholesale, minQty: q.minQty }}
                        canBuy={canBuy(p)}
                        onAdd={() => handleAdd(p)}
                      />
                    </Reveal>
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
        </section>
      </div>
    </StorefrontLayout>
  );
}
