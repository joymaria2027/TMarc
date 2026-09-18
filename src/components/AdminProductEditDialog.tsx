import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getProductPublicUrl } from "@/lib/productImage";
import { toast } from "sonner";
import { Crop, Images, Save, CheckCircle2, AlertCircle } from "lucide-react";

export interface AdminProductEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    merchant_id: string;
    name: string;
    description: string | null;
    price: number;
    quantity: number;
    track_inventory: boolean;
    available_today: boolean;
    is_active: boolean;
    category_id: string | null;
    approval_status: string;
    rejection_reason?: string | null;
    image_path: string | null;
    image_paths?: string[] | null;
    merchants?: { id: string; name: string } | null;
  } | null;
  wholesale?: {
    wholesale_price: number | null;
    min_quantity: number;
  } | null;
  currentUserId?: string;
  onSaved: () => void;
  onOpenImageEditor?: () => void;
}

export default function AdminProductEditDialog({
  open,
  onOpenChange,
  product,
  wholesale,
  currentUserId,
  onSaved,
  onOpenImageEditor,
}: AdminProductEditDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [quantity, setQuantity] = useState("0");
  const [trackInventory, setTrackInventory] = useState(false);
  const [availableToday, setAvailableToday] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [wsPrice, setWsPrice] = useState("");
  const [wsMin, setWsMin] = useState("1");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate data whenever dialog opens or product changes
  useEffect(() => {
    if (!open || !product) return;
    setName(product.name || "");
    setDescription(product.description || "");
    setPrice(product.price != null ? product.price.toString() : "0");
    setCategoryId(product.category_id || "none");
    setQuantity(product.quantity != null ? product.quantity.toString() : "0");
    setTrackInventory(Boolean(product.track_inventory));
    setAvailableToday(Boolean(product.available_today));
    setIsActive(Boolean(product.is_active));
    setWsPrice(wholesale?.wholesale_price != null ? wholesale.wholesale_price.toString() : "");
    setWsMin(wholesale?.min_quantity != null ? wholesale.min_quantity.toString() : "1");
    setErrors({});

    // Load merchant-specific categories
    (async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id,name")
        .eq("merchant_id", product.merchant_id)
        .order("name");
      setCategories(data || []);
    })();
  }, [open, product, wholesale]);

  if (!product) return null;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Product name is required.";
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) errs.price = "Valid price is required.";
    if (trackInventory) {
      const numQty = parseInt(quantity, 10);
      if (isNaN(numQty) || numQty < 0) errs.quantity = "Valid non-negative stock quantity required.";
    }
    if (wsPrice.trim()) {
      const numWs = parseFloat(wsPrice);
      if (isNaN(numWs) || numWs < 0) errs.wsPrice = "Wholesale price must be a valid number.";
      const numMin = parseInt(wsMin, 10);
      if (isNaN(numMin) || numMin < 1) errs.wsMin = "Wholesale minimum must be at least 1.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (andApprove: boolean = false) => {
    if (!validate()) return;
    setSaving(true);
    try {
      const updatePayload: Record<string, any> = {
        name: name.trim(),
        description: description.trim() || null,
        price: parseFloat(price),
        category_id: categoryId === "none" ? null : categoryId,
        quantity: trackInventory ? parseInt(quantity, 10) || 0 : 0,
        track_inventory: trackInventory,
        available_today: availableToday,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (andApprove) {
        updatePayload.approval_status = "approved";
        updatePayload.approved_at = new Date().toISOString();
        if (currentUserId) updatePayload.approved_by = currentUserId;
        updatePayload.rejection_reason = null;
      }

      const { error: pErr } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", product.id);

      if (pErr) throw pErr;

      // Update wholesale pricing
      if (wsPrice.trim()) {
        const { error: wErr } = await (supabase.from("product_wholesale_pricing" as any).upsert({
          product_id: product.id,
          merchant_id: product.merchant_id,
          wholesale_price: parseFloat(wsPrice),
          min_quantity: parseInt(wsMin, 10) || 1,
        }) as any);
        if (wErr) throw wErr;
      } else {
        await (supabase.from("product_wholesale_pricing" as any)
          .delete()
          .eq("product_id", product.id) as any);
      }

      toast.success(andApprove ? "Product updated and approved" : "Product details updated");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  const imagesList: string[] = product.image_paths && product.image_paths.length > 0
    ? product.image_paths
    : product.image_path ? [product.image_path] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
            <DialogTitle className="text-xl">Edit Product Details</DialogTitle>
            <Badge
              variant={
                product.approval_status === "approved"
                  ? "default"
                  : product.approval_status === "rejected"
                  ? "destructive"
                  : "secondary"
              }
              className="capitalize text-xs"
            >
              {product.approval_status}
            </Badge>
          </div>
          <DialogDescription>
            Review and adjust product information submitted by{" "}
            <strong>{product.merchants?.name || "Merchant"}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Photos Overview Section */}
          <div className="p-3.5 bg-muted/20 border rounded-lg space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Images className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-semibold">Product Photos</span>
                <Badge variant="outline" className="text-xs">
                  {imagesList.length} / 10 photos
                </Badge>
              </div>
              {onOpenImageEditor && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenImageEditor();
                  }}
                >
                  <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                  Manage & Crop Photos
                </Button>
              )}
            </div>

            {imagesList.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
                {imagesList.map((path, idx) => {
                  const url = getProductPublicUrl(path);
                  return (
                    <div
                      key={idx}
                      className="relative w-16 h-16 shrink-0 rounded-md border overflow-hidden bg-muted/40"
                    >
                      {url ? (
                        <img
                          src={url}
                          alt=""
                          aria-hidden="true"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                          No URL
                        </div>
                      )}
                      {idx === 0 && (
                        <span className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-[9px] text-center font-medium py-0.5">
                          Cover
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No photos uploaded for this product.</p>
            )}
          </div>

          {/* Basic Information */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-edit-name">Product Name *</Label>
              <Input
                id="admin-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fresh Wonjo Juice 500ml"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "admin-edit-name-err" : undefined}
              />
              {errors.name && (
                <p id="admin-edit-name-err" className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  {errors.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-category">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="admin-edit-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Uncategorized</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-price">Retail Price (D) *</Label>
                <Input
                  id="admin-edit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? "admin-edit-price-err" : undefined}
                />
                {errors.price && (
                  <p id="admin-edit-price-err" className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    {errors.price}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-edit-description">Description</Label>
              <Textarea
                id="admin-edit-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product description, ingredients, details..."
              />
            </div>
          </div>

          {/* Wholesale Pricing Section */}
          <div className="p-3.5 bg-muted/20 border rounded-lg space-y-3">
            <div>
              <span className="text-sm font-semibold">Wholesale Pricing (Optional)</span>
              <p className="text-xs text-muted-foreground">
                Configured rates displayed only to approved wholesale buyers.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-ws-price">Wholesale Unit Price (D)</Label>
                <Input
                  id="admin-edit-ws-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={wsPrice}
                  onChange={(e) => setWsPrice(e.target.value)}
                  placeholder="Leave blank if none"
                  aria-invalid={!!errors.wsPrice}
                  aria-describedby={errors.wsPrice ? "admin-edit-ws-price-err" : undefined}
                />
                {errors.wsPrice && (
                  <p id="admin-edit-ws-price-err" className="text-xs text-destructive">
                    {errors.wsPrice}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-edit-ws-min">Minimum Wholesale Quantity</Label>
                <Input
                  id="admin-edit-ws-min"
                  type="number"
                  min="1"
                  value={wsMin}
                  onChange={(e) => setWsMin(e.target.value)}
                  placeholder="1"
                  aria-invalid={!!errors.wsMin}
                  aria-describedby={errors.wsMin ? "admin-edit-ws-min-err" : undefined}
                />
                {errors.wsMin && (
                  <p id="admin-edit-ws-min-err" className="text-xs text-destructive">
                    {errors.wsMin}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Inventory & Operational Controls */}
          <div className="p-3.5 bg-muted/20 border rounded-lg space-y-3">
            <span className="text-sm font-semibold">Inventory & Availability</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-3 p-2 bg-background rounded border">
                <div className="space-y-0.5">
                  <Label htmlFor="admin-edit-track" className="text-xs font-medium cursor-pointer">
                    Track Inventory
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Manage stock levels</p>
                </div>
                <Switch
                  id="admin-edit-track"
                  checked={trackInventory}
                  onCheckedChange={setTrackInventory}
                />
              </div>

              {trackInventory && (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-edit-qty">Current Stock Quantity</Label>
                  <Input
                    id="admin-edit-qty"
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    aria-invalid={!!errors.quantity}
                    aria-describedby={errors.quantity ? "admin-edit-qty-err" : undefined}
                  />
                  {errors.quantity && (
                    <p id="admin-edit-qty-err" className="text-xs text-destructive">
                      {errors.quantity}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="flex items-center justify-between gap-3 p-2 bg-background rounded border">
                <div className="space-y-0.5">
                  <Label htmlFor="admin-edit-today" className="text-xs font-medium cursor-pointer">
                    Available Today
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Customers can order now</p>
                </div>
                <Switch
                  id="admin-edit-today"
                  checked={availableToday}
                  onCheckedChange={setAvailableToday}
                />
              </div>

              <div className="flex items-center justify-between gap-3 p-2 bg-background rounded border">
                <div className="space-y-0.5">
                  <Label htmlFor="admin-edit-active" className="text-xs font-medium cursor-pointer">
                    Active in Storefront
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Visible to shoppers</p>
                </div>
                <Switch
                  id="admin-edit-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSave(false)}
              disabled={saving}
              className="gap-1.5"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Changes
            </Button>
            {product.approval_status !== "approved" && (
              <Button
                type="button"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Save & Approve
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
