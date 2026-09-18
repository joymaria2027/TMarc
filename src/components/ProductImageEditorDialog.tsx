import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { getProductPublicUrl } from "@/lib/productImage";
import { toast } from "sonner";
import {
  Crop,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Upload,
  Star,
  Check,
  RotateCcw,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";

interface StagedImage {
  id: string;
  sourceUrl: string; // Preview URL (blob: or CDN url)
  isNewOrEdited: boolean;
  blob?: Blob;
  storagePath?: string; // If already existing in Supabase storage
  naturalWidth?: number;
  naturalHeight?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: string;
    name: string;
    merchant_id: string;
    image_path?: string | null;
    image_paths?: string[] | null;
  };
  onSaved: (newImagePaths: string[]) => void;
}

type AspectRatioPreset = "4/3" | "1/1" | "16/9" | "free";

export default function ProductImageEditorDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: Props) {
  const [images, setImages] = useState<StagedImage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [preset, setPreset] = useState<AspectRatioPreset>("4/3");
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [saving, setSaving] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);

  // Initialize images from product.image_paths or product.image_path
  useEffect(() => {
    if (!open) return;
    const rawPaths: string[] = [];
    if (product.image_paths && product.image_paths.length > 0) {
      rawPaths.push(...product.image_paths);
    } else if (product.image_path) {
      rawPaths.push(product.image_path);
    }

    const staged: StagedImage[] = rawPaths.map((path, idx) => ({
      id: `existing-${idx}-${path}`,
      sourceUrl: getProductPublicUrl(path) || "",
      isNewOrEdited: false,
      storagePath: path,
    }));

    setImages(staged);
    setSelectedIdx(0);
    setCropMode(false);
  }, [open, product]);

  const activeImage = images[selectedIdx] || null;

  // Handle uploading replacement or additional images (up to 10)
  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 10 - images.length;
    if (remainingSlots <= 0) {
      toast.error("Maximum 10 images allowed per product.");
      return;
    }

    const toAdd = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.warning(`Only ${remainingSlots} more image(s) can be added (limit 10).`);
    }

    const newItems: StagedImage[] = toAdd.map(f => ({
      id: `new-${Date.now()}-${Math.random()}`,
      sourceUrl: URL.createObjectURL(f),
      isNewOrEdited: true,
      blob: f,
    }));

    setImages(prev => [...prev, ...newItems]);
    if (e.target) e.target.value = "";
  };

  // Promote image to primary (index 0)
  const makePrimary = (index: number) => {
    if (index === 0) return;
    setImages(prev => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.unshift(item);
      return copy;
    });
    setSelectedIdx(0);
    toast.success("Cover image updated.");
  };

  // Reorder images
  const moveImage = (index: number, direction: "left" | "right") => {
    const targetIdx = direction === "left" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= images.length) return;
    setImages(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
    setSelectedIdx(targetIdx);
  };

  // Remove an image
  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    if (selectedIdx >= index && selectedIdx > 0) {
      setSelectedIdx(selectedIdx - 1);
    }
  };

  // Render crop preview on canvas
  useEffect(() => {
    if (!cropMode || !activeImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cropImageRef.current = img;
      const targetAspect = preset === "4/3" ? 4 / 3 : preset === "1/1" ? 1 : preset === "16/9" ? 16 / 9 : img.naturalWidth / img.naturalHeight;
      const outWidth = 800;
      const outHeight = Math.round(outWidth / targetAspect);
      canvas.width = outWidth;
      canvas.height = outHeight;

      ctx.clearRect(0, 0, outWidth, outHeight);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outWidth, outHeight);

      // Draw image scaled by zoom and pan
      const scale = Math.max(outWidth / img.naturalWidth, outHeight / img.naturalHeight) * zoom;
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const dx = (outWidth - sw) / 2 + (panX * outWidth) / 100;
      const dy = (outHeight - sh) / 2 + (panY * outHeight) / 100;

      ctx.drawImage(img, dx, dy, sw, sh);
    };
    img.src = activeImage.sourceUrl;
  }, [cropMode, activeImage, preset, zoom, panX, panY]);

  // Apply crop to current image
  const applyCrop = () => {
    if (!canvasRef.current || !activeImage) return;
    canvasRef.current.toBlob(blob => {
      if (!blob) {
        toast.error("Failed to crop image.");
        return;
      }
      const newUrl = URL.createObjectURL(blob);
      setImages(prev => {
        const copy = [...prev];
        copy[selectedIdx] = {
          ...copy[selectedIdx],
          sourceUrl: newUrl,
          isNewOrEdited: true,
          blob,
        };
        return copy;
      });
      setCropMode(false);
      toast.success("Crop applied to image.");
    }, "image/jpeg", 0.92);
  };

  // Save all modified images to Supabase storage and update products table
  const handleSaveAll = async () => {
    if (images.length === 0) {
      toast.error("Product must have at least one image.");
      return;
    }
    setSaving(true);
    try {
      const finalPaths: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        if (item.isNewOrEdited && item.blob) {
          const filename = `${product.merchant_id}/${Date.now()}-img${i}.jpg`;
          const { error: upErr } = await supabase.storage.from("product-images").upload(filename, item.blob, {
            contentType: "image/jpeg",
            upsert: true,
          });
          if (upErr) throw upErr;
          finalPaths.push(filename);
        } else if (item.storagePath) {
          finalPaths.push(item.storagePath);
        }
      }

      // Update product record
      const primaryPath = finalPaths[0] || null;
      const { error: dbErr } = await supabase
        .from("products")
        .update({
          image_paths: finalPaths,
          image_path: primaryPath,
        } as any)
        .eq("id", product.id);

      if (dbErr) throw dbErr;

      toast.success(`Saved ${finalPaths.length} product image(s) successfully.`);
      onSaved(finalPaths);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Error saving images: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
            <div>
              <DialogTitle className="text-xl">Admin Product Image & Framing Editor</DialogTitle>
              <DialogDescription>
                Edit, crop, reorder, or add photos for &ldquo;{product.name}&rdquo; (up to 10 images).
              </DialogDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {images.length} / 10 images
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* TOP THUMBNAILS STRIP */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Product gallery images (drag/click to reorder cover):
              </span>
              <span>Primary image is position #1</span>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1">
              {images.map((img, idx) => {
                const isSelected = idx === selectedIdx;
                const isPrimary = idx === 0;
                return (
                  <div
                    key={img.id}
                    onClick={() => {
                      setSelectedIdx(idx);
                      setCropMode(false);
                    }}
                    className={`relative w-20 h-20 shrink-0 rounded-md border-2 overflow-hidden cursor-pointer transition-all ${
                      isSelected ? "border-primary shadow-md scale-102" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <img src={img.sourceUrl} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                    {isPrimary && (
                      <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] font-bold px-1 rounded flex items-center gap-0.5 shadow">
                        <Star className="h-2.5 w-2.5 fill-current" /> Cover
                      </span>
                    )}
                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1 rounded font-mono">
                      #{idx + 1}
                    </span>
                  </div>
                );
              })}

              {images.length < 10 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 shrink-0 rounded-md border-2 border-dashed border-muted-foreground/40 hover:border-primary flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Upload className="h-5 w-5" />
                  <span>Add ({10 - images.length})</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleAddFiles}
            />
          </div>

          {/* MAIN EDITING AREA */}
          {activeImage ? (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap border-b pb-3">
                <div className="flex items-center gap-2">
                  <Badge variant={selectedIdx === 0 ? "default" : "secondary"}>
                    {selectedIdx === 0 ? "Cover / Primary Photo" : `Gallery Photo #${selectedIdx + 1}`}
                  </Badge>
                  {selectedIdx !== 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => makePrimary(selectedIdx)}
                    >
                      <Star className="h-3.5 w-3.5 text-primary" /> Set as Cover
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={selectedIdx === 0}
                    onClick={() => moveImage(selectedIdx, "left")}
                    title="Move left"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={selectedIdx === images.length - 1}
                    onClick={() => moveImage(selectedIdx, "right")}
                    title="Move right"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant={cropMode ? "default" : "outline"}
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setCropMode(!cropMode);
                      setZoom(1);
                      setPanX(0);
                      setPanY(0);
                    }}
                  >
                    <Crop className="h-3.5 w-3.5" /> {cropMode ? "Cancel Crop" : "Crop & Adjust"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 w-7 p-0"
                    onClick={() => removeImage(selectedIdx)}
                    title="Delete image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* VIEW / CROP AREA */}
              {!cropMode ? (
                <div className="flex flex-col items-center justify-center p-4 bg-muted/40 rounded-lg min-h-[320px]">
                  <div
                    className="relative w-80 max-w-full bg-muted/80 rounded-md border overflow-hidden flex items-center justify-center shadow"
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    <img
                      src={activeImage.sourceUrl}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-md opacity-25 scale-125 pointer-events-none"
                    />
                    <img
                      src={activeImage.sourceUrl}
                      alt="Active"
                      className="relative max-w-full max-h-full object-contain p-2"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Simulated storefront 4:3 card view with ambient edge containment (safe framing).
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Aspect Ratio Presets */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground">Aspect Ratio Preset:</span>
                    {(["4/3", "1/1", "16/9", "free"] as AspectRatioPreset[]).map(p => (
                      <Button
                        key={p}
                        size="sm"
                        variant={preset === p ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setPreset(p)}
                      >
                        {p === "4/3" ? "4:3 (Storefront Grid)" : p === "1/1" ? "1:1 (Square Detail)" : p === "16/9" ? "16:9 (Wide Banner)" : "Original"}
                      </Button>
                    ))}
                  </div>

                  {/* Interactive Crop Canvas */}
                  <div className="flex justify-center bg-black/90 p-4 rounded-lg overflow-hidden border">
                    <canvas ref={canvasRef} className="max-w-full max-h-[360px] rounded shadow-lg object-contain" />
                  </div>

                  {/* Pan & Zoom Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-muted/40 p-3 rounded-lg border text-xs">
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <Label htmlFor="crop-zoom" className="text-xs">Zoom</Label>
                        <span className="text-muted-foreground">{zoom.toFixed(1)}x</span>
                      </div>
                      <Slider id="crop-zoom" min={1} max={3} step={0.1} value={[zoom]} onValueChange={([v]) => setZoom(v)} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <Label htmlFor="crop-pan-x" className="text-xs">Pan Horizontal</Label>
                        <span className="text-muted-foreground">{panX}%</span>
                      </div>
                      <Slider id="crop-pan-x" min={-50} max={50} step={1} value={[panX]} onValueChange={([v]) => setPanX(v)} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <Label htmlFor="crop-pan-y" className="text-xs">Pan Vertical</Label>
                        <span className="text-muted-foreground">{panY}%</span>
                      </div>
                      <Slider id="crop-pan-y" min={-50} max={50} step={1} value={[panY]} onValueChange={([v]) => setPanY(v)} />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setZoom(1);
                        setPanX(0);
                        setPanY(0);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                    </Button>
                    <Button size="sm" onClick={applyCrop}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Apply Crop to Image
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center border rounded-lg bg-muted/20 text-muted-foreground">
              No images in gallery. Click &ldquo;Add&rdquo; above to upload photos.
            </div>
          )}

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between gap-3 border-t pt-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Changes are saved to Supabase Storage and will update both customer storefront and product detail views.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={saving || images.length === 0} onClick={handleSaveAll}>
                {saving ? "Saving..." : "Save All Changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
