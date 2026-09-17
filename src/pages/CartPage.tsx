import { Link, useNavigate } from "react-router-dom";
import StorefrontLayout from "@/components/StorefrontLayout";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";

export default function CartPage() {
  const { items, remove, setQty, subtotal, groups } = useCart();
  const navigate = useNavigate();

  return (
    <StorefrontLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="font-display text-3xl">Your cart</h1>
        {items.length === 0 ? (
          <Card><CardContent className="p-8 text-center space-y-3">
            <p className="text-muted-foreground">Your cart is empty.</p>
            <Button asChild><Link to="/shop">Browse products</Link></Button>
          </CardContent></Card>
        ) : (
          <>
            {Object.entries(groups).map(([mid, gItems]) => {
              const groupSubtotal = gItems.reduce((s, i) => s + i.price * i.quantity, 0);
              const merchantName = gItems[0].merchant_name || "Restaurant";
              return (
                <Card key={mid}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <Link to={`/shop/m/${mid}`} className="hover:underline">{merchantName}</Link>
                      <span className="text-sm text-muted-foreground font-normal">Subtotal: D {groupSubtotal.toFixed(2)}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    {gItems.map(i => (
                      <div key={i.product_id} className="flex items-center gap-3 border-t pt-3 first:border-t-0 first:pt-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{i.name}</p>
                          <p className="text-xs text-muted-foreground">D {i.price.toFixed(2)} each</p>
                        </div>
                        <Input type="number" min={1} value={i.quantity}
                          onChange={e => setQty(i.product_id, parseInt(e.target.value) || 1)}
                          className="w-20" />
                        <span className="w-24 text-right font-medium">D {(i.price * i.quantity).toFixed(2)}</span>
                        <Button variant="ghost" size="icon" onClick={() => remove(i.product_id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-lg">Subtotal</span>
                <span className="font-display text-2xl">D {subtotal.toFixed(2)}</span>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">
              Items from {Object.keys(groups).length > 1 ? `${Object.keys(groups).length} restaurants will be placed as separate orders` : "this restaurant"}.
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
