import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Percent } from "lucide-react";
import { toast } from "sonner";
import { validateProductForm, type Errors } from "./merchantGroup.helpers";

interface Merchant { id: string; name: string; business_type_id: string | null; business_type_name?: string; }
interface Product {
  id: string; merchant_id: string; name: string; description: string | null; price: number;
  quantity: number; track_inventory: boolean; available_today: boolean; is_active: boolean;
  image_path: string | null; approval_status: string; rejection_reason: string | null;
}

interface WholesaleRow { product_id: string; wholesale_price: number | null; min_quantity: number }

export default function MerchantProductsPage() {
  const { user, hasRole } = useAuth();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [wholesale, setWholesale] = useState<Record<string, WholesaleRow>>({});
  const [wsOpen, setWsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const isRestaurant = merchants.find(m => m.id === selected)?.business_type_name?.toLowerCase().match(/restaurant|food/);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let query = supabase.from("merchants").select("id,name,business_type_id,business_types(name)");
      if (!hasRole("admin")) query = query.eq("manager_user_id", user.id);
      const { data } = await query;
      const m = (data || []).map((x: any) => ({ ...x, business_type_name: x.business_types?.name }));
      setMerchants(m);
      if (m.length > 0 && !selected) setSelected(m[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasRole]);

  const load = async () => {
    if (!selected) return;
    const { data } = await supabase.from("products").select("*").eq("merchant_id", selected).order("created_at", { ascending: false });
    setProducts((data || []) as any);
    const { data: w } = await (supabase.from("product_wholesale_pricing" as any)
      .select("product_id,wholesale_price,min_quantity").eq("merchant_id", selected) as any);
    const map: Record<string, WholesaleRow> = {};
    for (const r of ((w || []) as WholesaleRow[])) map[r.product_id] = r;
    setWholesale(map);
  };
  useEffect(() => { load(); }, [selected]);

  // Scoped realtime: only this merchant's products re-fetch, debounced so
  // bulk edits collapse into one load.
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selected) return;
    const schedule = () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      loadTimer.current = setTimeout(() => { load(); }, 350);
    };
    const ch = supabase
      .channel(`merchant-products-${selected}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `merchant_id=eq.${selected}` }, schedule)
      .subscribe();
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const save = async (p: Partial<Product>, file: File | null, ws?: { price: string; minQty: string }) => {
    try {
      let image_path = p.image_path ?? null;
      if (file) {
        const path = `${selected}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) throw error;
        image_path = path;
      }
      const payload: any = {
        merchant_id: selected,
        name: p.name, description: p.description, price: p.price,
        quantity: p.quantity ?? 0,
        track_inventory: !isRestaurant,
        available_today: p.available_today ?? true,
        is_active: p.is_active ?? true,
        image_path,
      };
      let productId = editing?.id ?? null;
      if (editing) {
        payload.approval_status = "pending";
        payload.rejection_reason = null;
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Product updated — pending re-approval");
      } else {
        const { data: inserted, error } = await supabase.from("products").insert(payload).select("id").maybeSingle();
        if (error) throw error;
        productId = (inserted as any)?.id ?? null;
        toast.success("Product submitted for approval");
      }

      if (productId) {
        const priceVal = ws?.price?.trim() ? parseFloat(ws.price) : null;
        const minQty = Math.max(1, parseInt(ws?.minQty || "1") || 1);
        if (priceVal === null) {
          await (supabase.from("product_wholesale_pricing" as any).delete().eq("product_id", productId) as any);
        } else {
          const { error: wErr } = await (supabase.from("product_wholesale_pricing" as any).upsert({
            product_id: productId, merchant_id: selected, wholesale_price: priceVal, min_quantity: minQty,
          }, { onConflict: "product_id" }) as any);
          if (wErr) throw wErr;
        }
      }
      setOpen(false); setEditing(null); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (p: Product, val: boolean) => {
    await supabase.from("products").update({ is_active: val }).eq("id", p.id); load();
  };
  const toggleToday = async (p: Product, val: boolean) => {
    await supabase.from("products").update({ available_today: val }).eq("id", p.id); load();
  };
  const remove = async (p: Product) => {
    await supabase.from("products").delete().eq("id", p.id);
    setDeleteTarget(null);
    toast.success("Product deleted");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground">Catalog for your store</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {merchants.length > 1 && (
            <div className="space-y-1">
              <Label htmlFor="product-merchant" className="sr-only">Choose store</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger id="product-merchant" className="w-56 min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Dialog open={wsOpen} onOpenChange={setWsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!selected}><Percent className="h-4 w-4 mr-1" aria-hidden="true" />Wholesale settings</Button>
            </DialogTrigger>
            <WholesaleSettingsDialog merchantId={selected} onDone={() => setWsOpen(false)} />
          </Dialog>
          <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" aria-hidden="true" />New product</Button></DialogTrigger>
            <ProductDialog editing={editing} isRestaurant={!!isRestaurant}
              wholesale={editing ? wholesale[editing.id] : undefined} onSave={save} />
          </Dialog>
        </div>
      </div>

      {products.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground space-y-2">
          <p>No products yet.</p>
          <p className="text-sm">Add your first product — it goes live after an admin approves it.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <div className="flex gap-1 flex-wrap">
                    <Badge className="text-xs" variant={p.approval_status === "approved" ? "default" : p.approval_status === "rejected" ? "destructive" : "secondary"}>
                      {p.approval_status}
                    </Badge>
                    {!p.is_active && <Badge className="text-xs" variant="outline">archived</Badge>}
                  </div>
                </div>
                <span className="text-lg font-semibold tabular-nums">D {Number(p.price).toFixed(2)}</span>
              </CardHeader>
              <CardContent className="space-y-2">
                {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                {p.rejection_reason && <p className="text-xs text-destructive">Rejected: {p.rejection_reason}</p>}
                {wholesale[p.id]?.wholesale_price != null && (
                  <p className="text-xs text-primary tabular-nums">
                    Wholesale: D {Number(wholesale[p.id].wholesale_price).toFixed(2)} (min {wholesale[p.id].min_quantity})
                  </p>
                )}
                {isRestaurant ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Label htmlFor={`today-${p.id}`}>Available today</Label>
                    <Switch id={`today-${p.id}`} checked={p.available_today} onCheckedChange={v => toggleToday(p, v)} aria-label={`Available today: ${p.name}`} />
                  </div>
                ) : (
                  <p className="text-sm">Stock: <span className="font-medium tabular-nums">{p.quantity}</span></p>
                )}
                <div className="flex items-center justify-between gap-2 text-sm">
                  <Label htmlFor={`active-${p.id}`}>Active</Label>
                  <Switch id={`active-${p.id}`} checked={p.is_active} onCheckedChange={v => toggleActive(p, v)} aria-label={`Active: ${p.name}`} />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(p); setOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete product ${p.name}`} onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the product from your store. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && remove(deleteTarget)}>
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductDialog({ editing, isRestaurant, wholesale, onSave }: {
  editing: Product | null; isRestaurant: boolean;
  wholesale?: WholesaleRow;
  onSave: (p: Partial<Product>, file: File | null, ws?: { price: string; minQty: string }) => void;
}) {
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [price, setPrice] = useState(editing?.price?.toString() || "");
  const [quantity, setQuantity] = useState(editing?.quantity?.toString() || "0");
  const [file, setFile] = useState<File | null>(null);
  const [wsPrice, setWsPrice] = useState(wholesale?.wholesale_price?.toString() || "");
  const [wsMin, setWsMin] = useState(wholesale?.min_quantity?.toString() || "1");
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    setName(editing?.name || ""); setDescription(editing?.description || "");
    setPrice(editing?.price?.toString() || ""); setQuantity(editing?.quantity?.toString() || "0");
    setFile(null);
    setWsPrice(wholesale?.wholesale_price?.toString() || "");
    setWsMin(wholesale?.min_quantity?.toString() || "1");
    setErrors({});
  }, [editing, wholesale]);

  const submit = () => {
    const errs = validateProductForm({ name, price });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSave({
      name, description, price: parseFloat(price) || 0, quantity: parseInt(quantity) || 0,
      image_path: editing?.image_path ?? null, available_today: editing?.available_today ?? true,
      is_active: editing?.is_active ?? true,
    }, file, { price: wsPrice, minQty: wsMin });
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
        <DialogDescription>New and edited products go live after admin approval.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="product-name">Name *</Label>
          <Input id="product-name" required aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? "product-name-error" : undefined} value={name} onChange={e => setName(e.target.value)} />
          {errors.name && <p id="product-name-error" className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-description">Description</Label>
          <Textarea id="product-description" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="product-price">Price (D) *</Label>
            <Input id="product-price" required aria-required="true" type="number" step="0.01" min={0} aria-invalid={!!errors.price} aria-describedby={errors.price ? "product-price-error" : undefined} value={price} onChange={e => setPrice(e.target.value)} />
            {errors.price && <p id="product-price-error" className="text-xs text-destructive">{errors.price}</p>}
          </div>
          {!isRestaurant && (
            <div className="space-y-1.5">
              <Label htmlFor="product-qty">Quantity in stock</Label>
              <Input id="product-qty" type="number" min={0} value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border p-3">
          <div className="col-span-1 sm:col-span-2 text-xs font-medium text-muted-foreground">Wholesale (optional — shown only to approved wholesalers)</div>
          <div className="space-y-1.5">
            <Label htmlFor="product-ws-price">Wholesale price (D)</Label>
            <Input id="product-ws-price" type="number" step="0.01" min={0} value={wsPrice} onChange={e => setWsPrice(e.target.value)} placeholder="Leave blank" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-ws-min">Minimum quantity</Label>
            <Input id="product-ws-min" type="number" min={1} value={wsMin} onChange={e => setWsMin(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-image">Image</Label>
          <Input id="product-image" type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>
        <Button className="w-full" onClick={submit}>{editing ? "Save changes" : "Submit for approval"}</Button>
      </div>
    </DialogContent>
  );
}

function WholesaleSettingsDialog({ merchantId, onDone }: { merchantId: string; onDone: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [minQty, setMinQty] = useState("1");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!merchantId) return;
    (async () => {
      const { data } = await (supabase.from("merchant_wholesale_settings" as any)
        .select("is_enabled,discount_percent,min_quantity").eq("merchant_id", merchantId).maybeSingle() as any);
      const row: any = data;
      setEnabled(!!row?.is_enabled);
      setDiscount(row?.discount_percent?.toString() || "0");
      setMinQty(row?.min_quantity?.toString() || "1");
      setLoading(false);
    })();
  }, [merchantId]);

  const save = async () => {
    const { error } = await (supabase.from("merchant_wholesale_settings" as any).upsert({
      merchant_id: merchantId,
      is_enabled: enabled,
      discount_percent: Math.min(100, Math.max(0, parseFloat(discount) || 0)),
      min_quantity: Math.max(1, parseInt(minQty) || 1),
    }, { onConflict: "merchant_id" }) as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Wholesale settings saved");
    onDone();
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Store wholesale settings</DialogTitle>
        <DialogDescription>Fallback discount for products without their own wholesale price.</DialogDescription>
      </DialogHeader>
      {loading ? <p className="text-sm text-muted-foreground" role="status">Loading wholesale settings…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This discount applies to every product that has no wholesale price of its own.
          </p>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="ws-enabled">Offer wholesale pricing</Label>
            <Switch id="ws-enabled" checked={enabled} onCheckedChange={setEnabled} aria-label="Offer wholesale pricing" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ws-discount">Discount (%)</Label>
              <Input id="ws-discount" type="number" min={0} max={100} step="0.1" value={discount} onChange={e => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-min">Minimum quantity</Label>
              <Input id="ws-min" type="number" min={1} value={minQty} onChange={e => setMinQty(e.target.value)} />
            </div>
          </div>
          <Button className="w-full" onClick={save}>Save settings</Button>
        </div>
      )}
    </DialogContent>
  );
}
