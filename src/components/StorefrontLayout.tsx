import { ReactNode, FormEvent } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ShoppingBag, ShoppingCart, User, Package, Store, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { usePrefersDark } from "@/hooks/usePrefersDark";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import UserNotificationBell from "@/components/UserNotificationBell";
import ThemeToggle from "@/components/ThemeToggle";

const tabs = [
  { to: "/shop", label: "Shop", Icon: ShoppingBag, end: true },
  { to: "/cart", label: "Cart", Icon: ShoppingCart, end: true },
  { to: "/account/orders", label: "My Orders", Icon: Package, end: true },
] as const;

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { items } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  usePrefersDark();
  const count = items.reduce((s, i) => s + i.quantity, 0);

  // Depop's most prominent control: a global header search, on every storefront page.
  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const q = String(data.get("q") ?? "").trim();
    if (q) navigate(`/shop?q=${encodeURIComponent(q)}`);
    else navigate("/shop");
  };

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/shop" className="flex items-center gap-2.5 min-h-[44px]" aria-label="DeliveryAce Shop home">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="font-sans text-xl font-semibold tracking-tight">DeliveryAce Shop</span>
          </Link>
          <form role="search" aria-label="Site search" onSubmit={submitSearch} className="hidden lg:flex flex-1 justify-center px-6">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                name="q"
                placeholder='Search for "grilled fish"'
                aria-label="Search products and stores"
                className="h-11 w-full rounded-full border border-foreground/80 bg-card pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </form>
          <nav aria-label="Primary" className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/shop" aria-current={location.pathname === "/shop" ? "page" : undefined}><ShoppingBag className="h-5 w-5 mr-1" aria-hidden="true" />Shop</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/wholesale" aria-current={location.pathname === "/wholesale" ? "page" : undefined}><Store className="h-5 w-5 mr-1" aria-hidden="true" />Wholesale</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/sell" aria-current={location.pathname === "/sell" ? "page" : undefined}><Store className="h-5 w-5 mr-1" aria-hidden="true" />Sell</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link
                to="/cart"
                className="relative"
                aria-current={location.pathname === "/cart" ? "page" : undefined}
                aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
              >
                <ShoppingCart className="h-5 w-5 mr-1" aria-hidden="true" />Cart
                {count > 0 && (
                  <span aria-hidden="true" className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-w-5 min-h-5 inline-flex items-center justify-center text-center">{count}</span>
                )}
              </Link>
            </Button>
            {user ? (
              <>
                <UserNotificationBell />
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/account/orders" aria-current={location.pathname === "/account/orders" ? "page" : undefined}>
                    <Package className="h-5 w-5 mr-1" aria-hidden="true" />My Orders
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth?as=customer&tab=signin"><User className="h-5 w-5 mr-1" aria-hidden="true" />Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/auth?as=customer&tab=signup">Create account</Link>
                </Button>
              </>
            )}
          </nav>
          {/* Compact mobile actions — full tab bar is at bottom */}
          <nav aria-label="Primary mobile" className="flex md:hidden items-center gap-1">
            {user && <UserNotificationBell />}
            <Button variant="ghost" size="icon" asChild>
              <Link to="/cart" aria-label={count > 0 ? `Cart, ${count} items` : "Cart"} className="relative">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                {count > 0 && (
                  <span aria-hidden="true" className="absolute top-1 right-1 rounded-full bg-primary text-primary-foreground text-xs px-1 min-w-5 min-h-5 inline-flex items-center justify-center">{count}</span>
                )}
              </Link>
            </Button>
            {user ? (
              <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
            ) : (
              <Button size="sm" asChild>
                <Link to="/auth?as=customer&tab=signin">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="container mx-auto px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
      >
        {children}
      </main>

      {/* Legal footer — trust signal wherever accounts or orders are created */}
      <footer className="border-t bg-card/60">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} DeliveryAce</p>
          <ThemeToggle />
          <nav aria-label="Legal" className="flex items-center gap-4">
            <Link to="/privacy" className="underline-offset-2 hover:underline">Privacy policy</Link>
            <Link to="/wholesale" className="underline-offset-2 hover:underline">Wholesale</Link>
            <a href="mailto:support@deliveryace.example" className="underline-offset-2 hover:underline">Contact</a>
          </nav>
        </div>
      </footer>

      {/* iOS bottom tab bar: 2–5 destinations within thumb reach */}
      <nav
        aria-label="Store sections"
        className="md:hidden sticky bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 min-h-[49px]">
          {tabs.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={to === "/cart" && count > 0 ? `${label}, ${count} items` : label}
              onClick={() => haptics.selectionChanged()}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-[49px] text-xs font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {to === "/cart" && count > 0 && (
                      <span aria-hidden="true" className="absolute -top-1.5 -right-2.5 rounded-full bg-primary text-primary-foreground text-xs px-1 min-w-5 min-h-5 inline-flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </span>
                  <span aria-hidden={false}>{label}</span>
                  <span aria-hidden="true" className={cn("h-1 w-1 rounded-full", isActive ? "bg-primary" : "bg-transparent")} />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
