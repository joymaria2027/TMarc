import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

export interface ProductCardProduct {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price: number | string;
  quantity: number;
  track_inventory: boolean;
  available_today: boolean;
  image_path: string | null;
}

export interface ProductCardQuote {
  price: number;
  retailPrice?: number;
  isWholesale: boolean;
  minQty: number;
}

interface Props {
  product: ProductCardProduct;
  merchantName?: string | null;
  imageUrl?: string | null;
  quote: ProductCardQuote;
  canBuy: boolean;
  onAdd: () => void;
  showMerchantLink?: boolean;
}

export function stockBadge(p: ProductCardProduct) {
  if (!p.available_today) return { label: "Closed today", variant: "secondary" as const };
  if (p.track_inventory && p.quantity <= 0) return { label: "Out of stock", variant: "destructive" as const };
  if (p.track_inventory) return { label: `${p.quantity} in stock`, variant: "outline" as const };
  return null;
}

export default function ProductCard({
  product: p,
  merchantName,
  imageUrl,
  quote,
  canBuy,
  onAdd,
  showMerchantLink = true,
}: Props) {
  const badge = stockBadge(p);
  return (
    <Card className="overflow-hidden flex flex-col h-full">
      <Link
        to={`/shop/p/${p.id}`}
        className="block relative w-full bg-muted/60 overflow-hidden flex items-center justify-center group"
        style={{ aspectRatio: "4 / 3" }}
        aria-label={`View ${p.name}`}
      >
        {imageUrl ? (
          <>
            {/* Ambient blurred backdrop to softly fill letterbox areas without cutting the product */}
            <img
              src={imageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-md opacity-25 scale-125 pointer-events-none"
            />
            {/* Crisp uncropped product image */}
            <img
              src={imageUrl}
              alt={p.name}
              className="relative max-w-full max-h-full object-contain p-2 transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Package className="h-6 w-6" aria-hidden="true" />
            <span className="text-xs">No image available</span>
          </div>
        )}
      </Link>
      <CardContent className="p-4 flex-1 flex flex-col gap-2">
        {showMerchantLink && merchantName && (
          <Link
            to={`/shop/m/${p.merchant_id}`}
            className="text-xs text-muted-foreground hover:underline truncate min-h-[1rem]"
          >
            {merchantName}
          </Link>
        )}
        <Link to={`/shop/p/${p.id}`}>
          <h3 className="font-semibold leading-tight hover:underline line-clamp-2 min-h-[2.5rem]">{p.name}</h3>
        </Link>
        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{p.description || ""}</p>
        <div className="flex items-center justify-between gap-2 pt-2 mt-auto flex-wrap">
          <span className="font-display text-lg flex items-baseline gap-2 tabular-nums min-w-0">
            D {quote.price.toFixed(2)}
            {quote.isWholesale && quote.retailPrice != null && (
              <span className="text-xs text-muted-foreground line-through font-sans tabular-nums">
                D {Number(quote.retailPrice).toFixed(2)}
              </span>
            )}
          </span>
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        </div>
        {quote.isWholesale && (
          <p className="text-xs text-primary">Wholesale · min {quote.minQty}</p>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={!canBuy}
          onClick={onAdd}
          aria-label={`Add ${p.name} to cart`}
        >
          Add to cart
        </Button>
      </CardContent>
    </Card>
  );
}
