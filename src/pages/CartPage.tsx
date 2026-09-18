import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StorefrontLayout from "@/components/StorefrontLayout";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";

export default function CartPage() {
  const { items, remove, setQty, subtotal, groups } = useCart();
  const navigate = useNavigate();
  const [announcement, setAnnouncement] = useState("");

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for cart updates */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="font-display text-3xl">Your cart</h1>
        {items.length === 0 ? (
          <Card><CardContent className="p-8 text-center space-y-3">
            <p role="status" className="text-muted-foreground">Your cart is empty.</p>
            <Button asChild><Link to="/shop">Browse products</Link></Button>
          </CardContent></Card>
        ) : (
          <>
            {Object.entries(groups).map(([mid, gItems]) => {
              const groupSubtotal = gItems.reduce((s, i) => s + i.price * i.quantity, 0);
              const merchantName = gItems[0].merchant_name || "Store";
              return (
                <Card key={mid}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
                      <Link to={`/shop/m/${mid}`} className="hover:underline min-w-0 truncate">{merchantName}</Link>
                      <span className="text-sm text-muted-foreground font-normal tabular-nums">Subtotal: {formatMoney(groupSubtotal)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    {gItems.map(i => (
                      <div key={i.product_id} className="flex flex-wrap items-center gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                        <div className="flex-1 min-w-0 basis-40">
                          <p className="font-medium truncate">{i.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(i.price)} each</p>
                        </div>
                        <Input type="number" min={1} value={i.quantity}
                          onChange={e => {
                            const q = parseInt(e.target.value) || 1;
                            setQty(i.product_id, q);
                            setAnnouncement(`${i.name} quantity set to ${q}`);
                          }}
                          className="h-11 w-20 text-center" aria-label={`Quantity for ${i.name}`} />
                        <span className="w-24 text-right font-medium tabular-nums shrink-0">{formatMoney(i.price * i.quantity)}</span>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${i.name} from cart`}
                          onClick={() => { remove(i.product_id); setAnnouncement(`${i.name} removed from cart`); }}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
            <Card>
              <CardContent className="p-4 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-lg">Subtotal</span>
                <span role="status" className="font-display text-2xl tabular-nums">{formatMoney(subtotal)}</span>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">
              Items from {Object.keys(groups).length > 1 ? `${Object.keys(groups).length} merchants will be placed as separate orders` : "this merchant"}.
            </p>
            <Button size="lg" className="w-full" onClick={() => navigate("/checkout")}>
              Proceed to checkout
            </Button>
          </>
        )}
      </div>
    </StorefrontLayout>
  );
}
