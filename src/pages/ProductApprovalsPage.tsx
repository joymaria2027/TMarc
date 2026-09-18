import { useEffect, useState, useMemo } from "react";
import { formatMoney } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getProductImageUrl, getProductPublicUrl } from "@/lib/productImage";
import { toast } from "sonner";
import {
  Eye,
  Crop,
  Package,
  Images,
  Edit3,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Store,
  Tag,
  Boxes,
} from "lucide-react";
import ProductImagePreviewDialog from "@/components/ProductImagePreviewDialog";
import ProductImageEditorDialog from "@/components/ProductImageEditorDialog";
import AdminProductEditDialog from "@/components/AdminProductEditDialog";

type ApprovalStatusFilter = "pending" | "approved" | "rejected" | "all";

interface WholesaleRow {
  product_id: string;
  wholesale_price: number | null;
  min_quantity: number;
}

export default function ProductApprovalsPage() {
  const { user, hasRole } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [wholesale, setWholesale] = useState<Record<string, WholesaleRow>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatusFilter>("pending");
  const [search, setSearch] = useState("");

  // Dialog states
  const [inspectingProduct, setInspectingProduct] = useState<any | null>(null);
  const [editingImagesProduct, setEditingImagesProduct] = useState<any | null>(null);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const [pRes, wsRes] = await Promise.all([
      supabase
        .from("products")
        .select("*, merchants(id,name,address), product_categories(id,name)")
        .order("created_at", { ascending: false }),
      (supabase.from("product_wholesale_pricing" as any)
        .select("product_id,wholesale_price,min_quantity") as any),
    ]);

    const prods = pRes.data || [];
    setProducts(prods);

    const wsMap: Record<string, WholesaleRow> = {};
    (wsRes.data || []).forEach((w: WholesaleRow) => {
      wsMap[w.product_id] = w;
    });
    setWholesale(wsMap);

    const urls: Record<string, string> = {};
    for (const p of prods) {
      const pub = getProductPublicUrl(p.image_path);
      if (pub) urls[p.id] = pub;
    }
    setImageUrls(urls);

    await Promise.all(
      prods.map(async (p: any) => {
        if (urls[p.id]) return;
        const u = await getProductImageUrl(p.image_path);
        if (u) urls[p.id] = u;
      }),
    );
    setImageUrls({ ...urls });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (!hasRole("admin")) {
    return <p className="text-muted-foreground">Admin access required.</p>;
  }

  const approve = async (id: string) => {
    const { error } = await supabase
      .from("products")
      .update({
        approval_status: "approved",
        approved_by: user!.id,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Product approved");
      load();
    }
  };

  const reject = async (id: string) => {
    const reason = reasons[id]?.trim();
    if (!reason) {
      setReasonErrors((r) => ({
        ...r,
        [id]: "Add a reason so the merchant knows what to fix",
      }));
      return;
    }
    const { error } = await supabase
      .from("products")
      .update({
        approval_status: "rejected",
        rejection_reason: reason,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Product rejected");
      load();
    }
  };

  // Status counts for badge tabs
  const counts = useMemo(() => {
    return {
      pending: products.filter((p) => p.approval_status === "pending").length,
      approved: products.filter((p) => p.approval_status === "approved").length,
      rejected: products.filter((p) => p.approval_status === "rejected").length,
      all: products.length,
    };
  }, [products]);

  // Filtered products based on active status tab and search text
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter !== "all" && p.approval_status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = p.name?.toLowerCase().includes(q);
        const matchesMerchant = p.merchants?.name?.toLowerCase().includes(q);
        const matchesCategory = p.product_categories?.name?.toLowerCase().includes(q);
        if (!matchesName && !matchesMerchant && !matchesCategory) return false;
      }
      return true;
    });
  }, [products, statusFilter, search]);

  return (
    <div className="space-y-5">
      {/* Header & Status Summary */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Product Approvals & Catalog Management</h1>
          <p className="text-sm text-muted-foreground">
            Preview, inspect aspect ratios, and edit any product detail submitted by merchants.
          </p>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-lg border">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            type="button"
            variant={statusFilter === "pending" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("pending")}
            className="h-8 text-xs gap-1.5"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Pending
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {counts.pending}
            </Badge>
          </Button>
          <Button
            type="button"
            variant={statusFilter === "approved" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("approved")}
            className="h-8 text-xs gap-1.5"
          >
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Approved
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {counts.approved}
            </Badge>
          </Button>
          <Button
            type="button"
            variant={statusFilter === "rejected" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("rejected")}
            className="h-8 text-xs gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Rejected
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {counts.rejected}
            </Badge>
          </Button>
          <Button
            type="button"
            variant={statusFilter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="h-8 text-xs gap-1.5"
          >
            All
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {counts.all}
            </Badge>
          </Button>
        </div>

        {/* Search Filter */}
        <div className="relative sm:w-64">
          <Label htmlFor="admin-catalog-search" className="sr-only">
            Search products or merchants
          </Label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            id="admin-catalog-search"
            placeholder="Search products, stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Main Catalog / Pending List */}
      {loading ? (
        <p className="text-muted-foreground py-8 text-center" role="status">
          Loading product catalog…
        </p>
      ) : filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground space-y-1.5" role="status">
            <Package className="h-8 w-8 mx-auto text-muted-foreground/60" aria-hidden="true" />
            <p className="font-medium text-foreground">No products found</p>
            <p className="text-xs">
              {statusFilter === "pending"
                ? "There are no pending submissions awaiting admin review right now."
                : "No products match the selected filter criteria."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((p) => {
            const ws = wholesale[p.id];
            const imgCount = p.image_paths?.length || (p.image_path ? 1 : 0);
            return (
              <Card key={p.id} className="overflow-hidden border shadow-xs">
                <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap pb-3 bg-muted/10 border-b">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base font-semibold">{p.name}</CardTitle>
                      {p.product_categories?.name && (
                        <Badge variant="outline" className="text-xs gap-1 font-normal">
                          <Tag className="h-3 w-3" aria-hidden="true" />
                          {p.product_categories.name}
                        </Badge>
                      )}
                      <Badge
                        variant={
                          p.approval_status === "approved"
                            ? "default"
                            : p.approval_status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                        className="capitalize text-xs"
                      >
                        {p.approval_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5" aria-hidden="true" />
                      <strong>{p.merchants?.name || "Merchant"}</strong>
                      {p.merchants?.address && ` · ${p.merchants.address}`}
                      <span className="text-muted-foreground/60">·</span>
                      <span>
                        Submitted {new Date(p.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0"
                    onClick={() => setEditingProduct(p)}
                  >
                    <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit Details
                  </Button>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  <div className="flex gap-5 flex-wrap items-start">
                    {/* Visual Media Section */}
                    {imageUrls[p.id] ? (
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div className="relative group">
                          <img
                            src={imageUrls[p.id]}
                            alt={p.name}
                            width={128}
                            height={128}
                            loading="lazy"
                            className="h-32 w-32 object-cover rounded-lg border cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => setInspectingProduct(p)}
                            title="Click to inspect aspect ratio & framing"
                          />
                          {imgCount > 1 && (
                            <Badge
                              variant="secondary"
                              className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0 bg-background/85 backdrop-blur-xs shadow-xs gap-1"
                            >
                              <Images className="h-3 w-3" aria-hidden="true" />
                              {imgCount} photos
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-1 w-full">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-1 gap-1"
                            onClick={() => setInspectingProduct(p)}
                            title="Inspect aspect ratio & framing"
                          >
                            <Eye className="h-3 w-3" aria-hidden="true" />
                            Framing
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-7 text-[11px] px-1 gap-1"
                            onClick={() => setEditingImagesProduct(p)}
                            title="Edit and crop uploaded photos"
                          >
                            <Crop className="h-3 w-3" aria-hidden="true" />
                            Crop
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-32 w-32 rounded-lg border border-dashed text-muted-foreground gap-1.5 p-2 text-center shrink-0 bg-muted/20">
                        <Package className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
                        <span className="text-[11px]">No image</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2 w-full gap-1"
                          onClick={() => setEditingImagesProduct(p)}
                        >
                          <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                          Add photos
                        </Button>
                      </div>
                    )}

                    {/* Detailed Attribute Breakdown */}
                    <div className="space-y-3 flex-1 min-w-[260px]">
                      {/* Pricing & Stock Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-muted/30 border text-xs">
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Retail Price</span>
                          <strong className="text-sm font-semibold tabular-nums">
                            {formatMoney(Number(p.price))}
                          </strong>
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[11px]">Wholesale</span>
                          {ws && ws.wholesale_price != null ? (
                            <span className="font-medium tabular-nums text-foreground">
                              {formatMoney(Number(ws.wholesale_price))}{" "}
                              <span className="text-[10px] text-muted-foreground">
                                (min {ws.min_quantity})
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">None</span>
                          )}
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[11px]">Inventory</span>
                          {p.track_inventory ? (
                            <span className="font-medium tabular-nums">
                              {p.quantity} in stock
                            </span>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Untracked
                            </Badge>
                          )}
                        </div>

                        <div>
                          <span className="text-muted-foreground block text-[11px]">Availability</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge
                              variant={p.available_today ? "outline" : "secondary"}
                              className="text-[10px] py-0 px-1 font-normal"
                            >
                              {p.available_today ? "Available" : "Closed today"}
                            </Badge>
                            <Badge
                              variant={p.is_active ? "outline" : "secondary"}
                              className="text-[10px] py-0 px-1 font-normal"
                            >
                              {p.is_active ? "Active" : "Hidden"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground block">
                          Description:
                        </span>
                        <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                          {p.description || "No description provided by merchant."}
                        </p>
                      </div>

                      {/* Rejection Note (if rejected) */}
                      {p.approval_status === "rejected" && p.rejection_reason && (
                        <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                          <strong>Rejection reason:</strong> {p.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions & Decision Panel */}
                  <div className="pt-2 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex-1 max-w-lg space-y-1">
                      <Label htmlFor={`reject-${p.id}`} className="text-xs text-muted-foreground">
                        Rejection reason (sent to merchant if rejected)
                      </Label>
                      <Input
                        id={`reject-${p.id}`}
                        placeholder="e.g. Please upload a clear photo or correct the retail price"
                        value={reasons[p.id] || ""}
                        aria-invalid={!!reasonErrors[p.id]}
                        aria-describedby={reasonErrors[p.id] ? `reject-${p.id}-error` : undefined}
                        onChange={(e) => {
                          setReasons((r) => ({ ...r, [p.id]: e.target.value }));
                          setReasonErrors((r) => ({ ...r, [p.id]: "" }));
                        }}
                        className="h-8 text-xs"
                      />
                      {reasonErrors[p.id] && (
                        <p id={`reject-${p.id}-error`} className="text-xs text-destructive">
                          {reasonErrors[p.id]}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingProduct(p)}
                        className="h-8 text-xs gap-1"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit details
                      </Button>
                      {p.approval_status !== "approved" && (
                        <Button
                          type="button"
                          size="sm"
                          aria-label={`Approve ${p.name}`}
                          onClick={() => approve(p.id)}
                          className="h-8 text-xs gap-1"
                        >
                          <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Approve
                        </Button>
                      )}
                      {p.approval_status !== "rejected" && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          aria-label={`Reject ${p.name}`}
                          onClick={() => reject(p.id)}
                          className="h-8 text-xs gap-1"
                        >
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Product Image Preview & Aspect Ratio Framing Inspector Dialog */}
      {inspectingProduct && (
        <ProductImagePreviewDialog
          open={!!inspectingProduct}
          onOpenChange={(open) => !open && setInspectingProduct(null)}
          productName={inspectingProduct.name}
          merchantName={inspectingProduct.merchants?.name}
          imageUrl={imageUrls[inspectingProduct.id] || null}
          price={inspectingProduct.price}
        />
      )}

      {/* Admin Multi-Image Canvas Cropper & Photo Manager Dialog */}
      {editingImagesProduct && (
        <ProductImageEditorDialog
          open={!!editingImagesProduct}
          onOpenChange={(open) => !open && setEditingImagesProduct(null)}
          product={editingImagesProduct}
          onSaved={() => {
            load();
          }}
        />
      )}

      {/* Admin Full Product Detail Editor Dialog */}
      {editingProduct && (
        <AdminProductEditDialog
          open={!!editingProduct}
          onOpenChange={(open) => !open && setEditingProduct(null)}
          product={editingProduct}
          wholesale={wholesale[editingProduct.id] || null}
          currentUserId={user?.id}
          onSaved={() => {
            load();
          }}
          onOpenImageEditor={() => {
            setEditingImagesProduct(editingProduct);
          }}
        />
      )}
    </div>
  );
}
