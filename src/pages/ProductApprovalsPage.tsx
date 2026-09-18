import { useEffect, useState } from "react";
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
import { Eye, Crop, Package, Images } from "lucide-react";
import ProductImagePreviewDialog from "@/components/ProductImagePreviewDialog";
import ProductImageEditorDialog from "@/components/ProductImageEditorDialog";

export default function ProductApprovalsPage() {
  const { user, hasRole } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [inspectingProduct, setInspectingProduct] = useState<any | null>(null);
  const [editingImagesProduct, setEditingImagesProduct] = useState<any | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("products")
      .select("*, merchants(name)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true });
    setProducts(data || []);

    const urls: Record<string, string> = {};
    for (const p of data || []) {
      const pub = getProductPublicUrl(p.image_path);
      if (pub) urls[p.id] = pub;
    }
    setImageUrls(urls);

    await Promise.all((data || []).map(async (p: any) => {
      if (urls[p.id]) return;
      const u = await getProductImageUrl(p.image_path);
      if (u) urls[p.id] = u;
    }));
    setImageUrls({ ...urls });
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (!hasRole("admin")) {
    return <p className="text-muted-foreground">Admin access required.</p>;
  }

  const approve = async (id: string) => {
    const { error } = await supabase.from("products").update({
      approval_status: "approved", approved_by: user!.id, approved_at: new Date().toISOString(), rejection_reason: null,
    }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Approved"); load(); }
  };
  const reject = async (id: string) => {
    const reason = reasons[id]?.trim();
    if (!reason) {
      setReasonErrors(r => ({ ...r, [id]: "Add a reason so the merchant knows what to fix" }));
      return;
    }
    const { error } = await supabase.from("products").update({
      approval_status: "rejected", rejection_reason: reason,
    }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Rejected"); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Product approvals</h1>
        <Badge variant="secondary" className="text-xs">{products.length} pending</Badge>
      </div>
      {loading ? (
        <p className="text-muted-foreground" role="status">Loading pending products…</p>
      ) : products.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground space-y-1" role="status">
          <p>No pending products.</p>
          <p className="text-sm">New merchant submissions will appear here for review.</p>
        </CardContent></Card>
      ) : products.map(p => (
        <Card key={p.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">{p.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{p.merchants?.name}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 flex-wrap items-start">
              {imageUrls[p.id] ? (
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className="relative group">
                    <img
                      src={imageUrls[p.id]}
                      alt={p.name}
                      width={128}
                      height={128}
                      loading="lazy"
                      className="h-32 w-32 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setInspectingProduct(p)}
                      title="Click to inspect aspect ratio & framing"
                    />
                    {p.image_paths && p.image_paths.length > 1 && (
                      <Badge variant="secondary" className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0 bg-background/85 backdrop-blur-xs shadow-xs gap-1">
                        <Images className="h-3 w-3" />
                        {p.image_paths.length}
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 w-full"
                    onClick={() => setInspectingProduct(p)}
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Inspect framing
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs gap-1 w-full"
                    onClick={() => setEditingImagesProduct(p)}
                  >
                    <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit & Crop
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 w-32 rounded-lg border border-dashed text-muted-foreground gap-1.5 p-2 text-center shrink-0 bg-muted/20">
                  <Package className="h-6 w-6 text-muted-foreground/60" />
                  <span className="text-[11px]">No image</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2 w-full gap-1"
                    onClick={() => setEditingImagesProduct(p)}
                  >
                    <Crop className="h-3.5 w-3.5" />
                    Add photos
                  </Button>
                </div>
              )}
              <div className="space-y-1 flex-1 min-w-52">
                {p.description && <p className="text-sm">{p.description}</p>}
                <p className="text-sm">Price: <strong className="tabular-nums">{formatMoney(Number(p.price))}</strong></p>
                {p.track_inventory && <p className="text-sm tabular-nums">Stock: {p.quantity}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`reject-${p.id}`}>Rejection reason</Label>
              <Input
                id={`reject-${p.id}`}
                placeholder="Required to reject — shown to the merchant"
                value={reasons[p.id] || ""}
                aria-invalid={!!reasonErrors[p.id]}
                aria-describedby={reasonErrors[p.id] ? `reject-${p.id}-error` : undefined}
                onChange={e => {
                  setReasons(r => ({ ...r, [p.id]: e.target.value }));
                  setReasonErrors(r => ({ ...r, [p.id]: "" }));
                }}
              />
              {reasonErrors[p.id] && <p id={`reject-${p.id}-error`} className="text-xs text-destructive">{reasonErrors[p.id]}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button aria-label={`Approve ${p.name}`} onClick={() => approve(p.id)}>Approve</Button>
              <Button variant="destructive" aria-label={`Reject ${p.name}`} onClick={() => reject(p.id)}>Reject</Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {inspectingProduct && (
        <ProductImagePreviewDialog
          open={!!inspectingProduct}
          onOpenChange={open => !open && setInspectingProduct(null)}
          productName={inspectingProduct.name}
          merchantName={inspectingProduct.merchants?.name}
          imageUrl={imageUrls[inspectingProduct.id] || null}
          price={inspectingProduct.price}
        />
      )}

      {editingImagesProduct && (
        <ProductImageEditorDialog
          open={!!editingImagesProduct}
          onOpenChange={open => !open && setEditingImagesProduct(null)}
          product={editingImagesProduct}
          onSaved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
