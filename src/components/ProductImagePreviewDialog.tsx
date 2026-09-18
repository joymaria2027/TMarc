import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, AlertTriangle, Eye, Maximize2, ShieldCheck, HelpCircle } from "lucide-react";
import { formatMoney } from "@/lib/finance";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  merchantName?: string | null;
  imageUrl: string | null;
  price?: number | string;
}

interface ImageStats {
  width: number;
  height: number;
  ratio: number;
  label: string;
  health: "optimal" | "tall" | "wide" | "square";
  description: string;
}

export default function ProductImagePreviewDialog({
  open,
  onOpenChange,
  productName,
  merchantName,
  imageUrl,
  price,
}: Props) {
  const [stats, setStats] = useState<ImageStats | null>(null);
  const [cropMode, setCropMode] = useState<"contain" | "cover">("contain");
  const [tab, setTab] = useState<"card" | "detail" | "raw">("card");

  useEffect(() => {
    if (!imageUrl) {
      setStats(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const ratio = w / h;
      let label = "Custom";
      let health: ImageStats["health"] = "optimal";
      let description = "";

      if (ratio >= 0.95 && ratio <= 1.05) {
        label = "1:1 Square";
        health = "square";
        description = "Standard square format. Fits both product detail and shop grids smoothly.";
      } else if (ratio >= 1.25 && ratio <= 1.45) {
        label = "4:3 Landscape";
        health = "optimal";
        description = "Native storefront card aspect ratio. Fills shop cards seamlessly.";
      } else if (ratio < 0.85) {
        label = ratio < 0.65 ? "9:16 Tall Portrait" : "3:4 Portrait";
        health = "tall";
        description = "Vertical photo. Ambient framing protects it so bottle tops, apparel, and labels are 100% visible without being cropped.";
      } else {
        label = ratio > 1.7 ? "16:9 Wide" : "3:2 Landscape";
        health = "wide";
        description = "Horizontal photo. Ambient framing protects it so sides and badges are 100% visible without being cropped.";
      }

      setStats({ width: w, height: h, ratio, label, health, description });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  if (!imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
            <div>
              <DialogTitle className="text-xl">Image Aspect Ratio & Framing Inspector</DialogTitle>
              <DialogDescription>
                Preview how &ldquo;{productName}&rdquo; will appear to customers across the storefront.
              </DialogDescription>
            </div>
            {stats && (
              <Badge
                variant={stats.health === "optimal" || stats.health === "square" ? "default" : "secondary"}
                className="text-xs px-2.5 py-1"
              >
                {stats.label} ({stats.width} × {stats.height}px)
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Health banner */}
          {stats && (
            <div className="rounded-lg border p-3 bg-muted/40 text-sm flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">
                  Framing verdict: <span className="font-semibold">{stats.label}</span>
                </p>
                <p className="text-xs text-muted-foreground">{stats.description}</p>
              </div>
            </div>
          )}

          {/* View tabs */}
          <Tabs value={tab} onValueChange={v => setTab(v as any)} className="w-full">
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2">
              <TabsList>
                <TabsTrigger value="card">Storefront Card (4:3)</TabsTrigger>
                <TabsTrigger value="detail">Product Detail (1:1)</TabsTrigger>
                <TabsTrigger value="raw">Original Upload</TabsTrigger>
              </TabsList>

              {tab === "card" && (
                <div className="flex items-center gap-1.5 text-xs bg-muted/60 p-1 rounded-md">
                  <span className="text-muted-foreground font-medium px-1">Framing mode:</span>
                  <Button
                    size="sm"
                    variant={cropMode === "contain" ? "default" : "ghost"}
                    className="h-7 text-xs px-2"
                    onClick={() => setCropMode("contain")}
                  >
                    Safe contain (live)
                  </Button>
                  <Button
                    size="sm"
                    variant={cropMode === "cover" ? "destructive" : "ghost"}
                    className="h-7 text-xs px-2"
                    onClick={() => setCropMode("cover")}
                  >
                    Cover (shows crop loss)
                  </Button>
                </div>
              )}
            </div>

            {/* TAB 1: STOREFRONT CARD */}
            <TabsContent value="card" className="space-y-3 mt-0">
              <div className="flex justify-center p-4 bg-muted/20 rounded-lg border">
                <div className="w-72 bg-card rounded-lg border shadow-sm overflow-hidden flex flex-col">
                  <div
                    className="relative w-full bg-muted/60 overflow-hidden flex items-center justify-center"
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    {cropMode === "contain" ? (
                      <>
                        {/* Ambient fill */}
                        <img
                          src={imageUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover blur-md opacity-25 scale-125 pointer-events-none"
                        />
                        {/* Safe contain image */}
                        <img
                          src={imageUrl}
                          alt={productName}
                          className="relative max-w-full max-h-full object-contain p-2"
                        />
                      </>
                    ) : (
                      <>
                        {/* Forced cover showing red crop indicator */}
                        <img
                          src={imageUrl}
                          alt={productName}
                          className="absolute inset-0 w-full h-full object-cover object-center"
                        />
                        <div className="absolute inset-0 border-2 border-dashed border-destructive pointer-events-none flex items-center justify-center bg-destructive/10">
                          <span className="text-xs bg-destructive text-destructive-foreground font-medium px-2 py-0.5 rounded shadow">
                            Edges cropped by cover
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-3 space-y-1.5">
                    {merchantName && <p className="text-[10px] text-muted-foreground">{merchantName}</p>}
                    <p className="font-semibold text-sm leading-snug line-clamp-1">{productName}</p>
                    <p className="font-display text-base font-semibold">
                      D {Number(price || 0).toFixed(2)}
                    </p>
                    <div className="pt-1">
                      <Button size="sm" className="w-full h-8 text-xs pointer-events-none opacity-90">
                        Add to cart
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {cropMode === "contain" ? (
                <p className="text-xs text-muted-foreground text-center">
                  ✓ Safe contain preserves 100% of the product photo with subtle ambient color framing in letterbox gaps.
                </p>
              ) : (
                <p className="text-xs text-destructive text-center font-medium">
                  ⚠️ Forced cover chops off edges. Safe contain is automatically enabled in DeliveryAce to avoid this loss.
                </p>
              )}
            </TabsContent>

            {/* TAB 2: PRODUCT DETAIL PAGE */}
            <TabsContent value="detail" className="space-y-3 mt-0">
              <div className="flex justify-center p-4 bg-muted/20 rounded-lg border">
                <div className="w-80 aspect-square bg-muted/40 rounded-lg border overflow-hidden relative flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full object-cover blur-lg opacity-25 scale-125 pointer-events-none"
                  />
                  <img
                    src={imageUrl}
                    alt={productName}
                    className="relative max-w-full max-h-full object-contain p-4"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Product Detail View (1:1 Square) as seen on <code className="text-xs">/shop/p/:id</code>.
              </p>
            </TabsContent>

            {/* TAB 3: RAW UNMODIFIED IMAGE */}
            <TabsContent value="raw" className="space-y-3 mt-0">
              <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-lg border max-h-96 overflow-auto">
                <img
                  src={imageUrl}
                  alt={productName}
                  className="max-h-80 w-auto rounded border shadow-sm object-contain"
                />
              </div>
              {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 border rounded bg-card">
                    <p className="text-muted-foreground">Width</p>
                    <p className="font-semibold text-sm">{stats.width}px</p>
                  </div>
                  <div className="p-2 border rounded bg-card">
                    <p className="text-muted-foreground">Height</p>
                    <p className="font-semibold text-sm">{stats.height}px</p>
                  </div>
                  <div className="p-2 border rounded bg-card">
                    <p className="text-muted-foreground">Aspect Ratio</p>
                    <p className="font-semibold text-sm">{stats.ratio.toFixed(2)}:1</p>
                  </div>
                  <div className="p-2 border rounded bg-card">
                    <p className="text-muted-foreground">Format Classification</p>
                    <p className="font-semibold text-sm">{stats.label}</p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close preview
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
