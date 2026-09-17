import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, ShoppingCart, User, Package, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { items } = useCart();
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/shop" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl tracking-tight">DeliveryAce Shop</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/shop"><ShoppingBag className="h-4 w-4 mr-1" />Shop</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/wholesale"><Store className="h-4 w-4 mr-1" />Wholesale</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/cart" className="relative">
                <ShoppingCart className="h-4 w-4 mr-1" />Cart
                {count > 0 && (
                  <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-w-5 text-center">{count}</span>
                )}
              </Link>
            </Button>
            {user ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/account/orders"><Package className="h-4 w-4 mr-1" />My Orders</Link>
                </Button>
                <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth?as=customer&tab=signin"><User className="h-4 w-4 mr-1" />Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/auth?as=customer&tab=signup">Create account</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
