import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/finance";
import { useNavigate, Navigate } from "react-router-dom";
import StorefrontLayout from "@/components/StorefrontLayout";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { resolveDeliveryFee } from "@/lib/deliveryFee";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { validateCheckout, firstInvalidField, type CheckoutErrors } from "@/lib/checkoutValidation";
import { decidePostOrderNavigation } from "@/lib/checkoutPostOrder";

export default function CheckoutPage() {
  const { items, subtotal, clear, groups, removeMerchant } = useCart();
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("delivery");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fees, setFees] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // inline auth at checkout
  const [authTab, setAuthTab] = useState<"signup" | "signin">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  // Debounce free-text address so each keystroke doesn't fan out fee lookups.
  const debouncedAddress = useDebouncedValue(address, 400);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: customer } = await supabase.from("customers").select("*").eq("user_id", user.id).maybeSingle();
      if (customer) {
        setFullName(customer.full_name || "");
        setPhone(customer.phone || "");
        setAddress(customer.default_address || "");
        setLat(customer.default_lat ? Number(customer.default_lat) : null);
        setLng(customer.default_lng ? Number(customer.default_lng) : null);
      }
    })();
  }, [user]);

  // resolve per-merchant delivery fee whenever fulfillment/debounced address/groups change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merchantIds = Object.keys(groups);
      if (fulfillment === "pickup") {
        setFees(Object.fromEntries(merchantIds.map(id => [id, 0])));
        return;
      }
      const entries = await Promise.all(merchantIds.map(async id => {
        const fee = await resolveDeliveryFee(id, debouncedAddress);
        return [id, fee] as const;
      }));
      if (!cancelled) setFees(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, debouncedAddress, items.length]);

  if (loading) return (
    <StorefrontLayout>
      <div role="status" aria-live="polite" aria-label="Loading checkout" className="max-w-2xl mx-auto space-y-3">
        <span className="sr-only">Loading checkout…</span>
        <div className="shimmer h-8 rounded w-1/3" aria-hidden="true" />
        <div className="shimmer h-28 rounded-lg" aria-hidden="true" />
        <div className="shimmer h-40 rounded-lg" aria-hidden="true" />
      </div>
    </StorefrontLayout>
  );
  if (items.length === 0) return <Navigate to="/cart" replace />;

  const totalDeliveryFees = Object.values(fees).reduce((a, b) => a + b, 0);
  const total = subtotal + totalDeliveryFees;

  const useGps = () => {
    if (!navigator.geolocation) return toast.error("GPS not available");
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); toast.success("Location captured"); },
      err => toast.error(err.message),
    );
  };

  const submitAuth = async () => {
    setAuthError(null);
    if (!authEmail || !authPassword) {
      const msg = "Enter your email and password.";
      setAuthError(msg);
      toast.error(msg);
      return;
    }
    setAuthBusy(true);
    try {
      if (authTab === "signup") {
        if (!fullName.trim()) {
          const msg = "Enter your full name above first.";
          setAuthError(msg);
          toast.error(msg);
          setAuthBusy(false);
          document.getElementById("checkout-fullname")?.focus();
          return;
        }
        await signUp(authEmail, authPassword, fullName);
        try { await supabase.rpc("self_assign_customer_role" as any); } catch {}
        toast.success("Account created — you can place your order now");
        setAnnouncement("Account created. You can place your order now.");
      } else {
        await signIn(authEmail, authPassword);
        toast.success("Signed in");
        setAnnouncement("Signed in. You can place your order now.");
      }
    } catch (err: any) {
      const msg = err.message || "Could not sign in";
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const submit = async () => {
    if (!user) {
      const msg = "Create an account or sign in above to continue — your details below are saved.";
      toast.error(msg);
      setAnnouncement(msg);
      requestAnimationFrame(() => document.getElementById("checkout-account")?.focus());
      return;
    }
    const nextErrors = validateCheckout({ fullName, phone, fulfillment, address });
    setErrors(nextErrors);
    const firstId = firstInvalidField(nextErrors);
    if (firstId) {
      const firstMessage = nextErrors.fullName ?? nextErrors.phone ?? nextErrors.address ?? "Check the highlighted fields.";
      toast.error(firstMessage);
      setAnnouncement(firstMessage);
      // Focus the first invalid field so keyboard + screen-reader users land on it.
      requestAnimationFrame(() => document.getElementById(firstId)?.focus());
      return;
    }
    setSubmitting(true);
    const merchantIds = Object.keys(groups);
    const orderIdsCreated: string[] = [];
    const orderMerchant = new Map<string, { id: string; name: string }>();
    try {
      // ensure customer row
      let { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
      if (!customer) {
        const { data: created, error: cErr } = await supabase
          .from("customers").insert({ user_id: user.id, full_name: fullName, phone }).select().single();
        if (cErr) throw cErr;
        customer = created;
      } else {
        const { error: uErr } = await supabase.from("customers").update({
          full_name: fullName, phone, default_address: address,
          default_lat: lat, default_lng: lng,
        }).eq("id", customer.id);
        if (uErr) throw uErr;
      }

      // Create one order per merchant
      const redirectUrls: (string | null)[] = [];

      for (const mid of merchantIds) {
        const gItems = groups[mid];
        const gSubtotal = gItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const gFee = fees[mid] ?? 0;
        const gTotal = gSubtotal + gFee;

        const { data: order, error: oErr } = await supabase.from("orders").insert({
          customer_id: customer.id,
          merchant_id: mid,
          fulfillment_type: fulfillment,
          subtotal: gSubtotal, delivery_fee: gFee, total: gTotal,
          dropoff_address: fulfillment === "delivery" ? address : null,
          dropoff_lat: lat, dropoff_lng: lng,
          customer_notes: notes,
        }).select().single();
        if (oErr) throw oErr;
        orderIdsCreated.push(order.id);
        orderMerchant.set(order.id, { id: mid, name: gItems[0]?.merchant_name || 'Store' });

        const { error: iErr } = await supabase.from("order_items").insert(
          gItems.map(i => ({
            order_id: order.id, product_id: i.product_id, name_snapshot: i.name,
            price_snapshot: i.price, quantity: i.quantity, line_total: i.price * i.quantity,
          }))
        );
        if (iErr) throw iErr;

        const { data: pay, error: pErr } = await supabase.functions.invoke("modempay-create-checkout", {
          body: { order_id: order.id, return_url: `${window.location.origin}/checkout/status/${order.id}` },
        });
        if (pErr) throw pErr;
        redirectUrls.push(pay?.stub ? null : (pay?.redirect_url ?? null));
      }

      const decision = decidePostOrderNavigation({ merchantIds, orderIds: orderIdsCreated, redirectUrls });
      clear();
      if (decision.kind === "redirect") {
        toast.success("Order placed — redirecting to payment");
        window.location.href = decision.url;
      } else if (decision.kind === "status") {
        toast.success("Order placed");
        navigate(`/checkout/status/${decision.orderId}`);
      } else {
        toast.success(
          merchantIds.length > 1
            ? `${merchantIds.length} orders placed — pay each from My orders`
            : "Order placed"
        );
        setAnnouncement(
          merchantIds.length > 1
            ? `${merchantIds.length} orders placed. Pay each from My orders.`
            : "Order placed."
        );
        navigate("/account/orders");
      }
    } catch (err: any) {
      // Merchants whose orders were created are done — drop only the rest from
      // the cart so a retry can't duplicate the already-created orders.
      const createdMerchantIds = new Set(
        orderIdsCreated.map(oid => orderMerchant.get(oid)?.id).filter(Boolean) as string[],
      );
      if (orderIdsCreated.length === 0) {
        // Nothing was created — cart stays fully intact for a clean retry.
        toast.error(err.message ?? 'Could not place your order. Please try again.');
      } else {
        // Partial failure: keep the created orders reachable and send the user
        // to complete payment from My orders.
        for (const mid of merchantIds) {
          if (!createdMerchantIds.has(mid)) removeMerchant(mid);
        }
        const decision = decidePostOrderNavigation({
          merchantIds,
          orderIds: orderIdsCreated,
          redirectUrls: [],
        });
        const firstName = orderMerchant.get(orderIdsCreated[0])?.name ?? 'Store';
        if (decision.kind === "status") {
          toast.error(
            `Your ${firstName} order was placed, but payment could not start. Complete it from My orders.`,
          );
          navigate(`/checkout/status/${decision.orderId}`);
        } else {
          toast.error(
            orderIdsCreated.length === 1
              ? 'Your order was placed, but payment could not start. Complete it from My orders.'
              : `${orderIdsCreated.length} of ${merchantIds.length} orders were placed — the rest stay in your cart to retry.`,
          );
          navigate('/account/orders');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for validation + order progress */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="font-display text-3xl">Checkout</h1>

        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="checkout-fullname">Full name</Label>
              <Input id="checkout-fullname" value={fullName} onChange={e => { setFullName(e.target.value); setErrors(prev => ({ ...prev, fullName: undefined })); }}
                autoComplete="name" aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "checkout-fullname-error" : undefined} />
              {errors.fullName && <p id="checkout-fullname-error" role="alert" className="text-sm text-destructive">{errors.fullName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout-phone">Phone</Label>
              <Input id="checkout-phone" type="tel" value={phone} onChange={e => { setPhone(e.target.value); setErrors(prev => ({ ...prev, phone: undefined })); }}
                autoComplete="tel" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "checkout-phone-error" : undefined} />
              {errors.phone && <p id="checkout-phone-error" role="alert" className="text-sm text-destructive">{errors.phone}</p>}
            </div>
          </CardContent>
        </Card>

        {!user && (
          <Card id="checkout-account" tabIndex={-1}>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <p id="checkout-auth-hint" className="text-sm text-muted-foreground">Create an account or sign in to place your order. Your account lets you track orders and reorder faster.</p>
            </CardHeader>
            <CardContent>
              <Tabs value={authTab} onValueChange={v => { setAuthTab(v as any); setAuthError(null); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                </TabsList>
                <TabsContent value="signup" className="space-y-3 mt-4">
                  <div className="space-y-1.5"><Label htmlFor="checkout-auth-email-signup">Email</Label><Input id="checkout-auth-email-signup" type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} autoComplete="email" /></div>
                  <div className="space-y-1.5"><Label htmlFor="checkout-auth-password-signup">Password</Label><Input id="checkout-auth-password-signup" type="password" minLength={6} value={authPassword} onChange={e => setAuthPassword(e.target.value)} autoComplete="new-password" /></div>
                  {authError && <p role="alert" className="text-sm text-destructive">{authError}</p>}
                  <Button className="w-full" disabled={authBusy} onClick={submitAuth}>{authBusy ? "Creating…" : "Create account"}</Button>
                </TabsContent>
                <TabsContent value="signin" className="space-y-3 mt-4">
                  <div className="space-y-1.5"><Label htmlFor="checkout-auth-email-signin">Email</Label><Input id="checkout-auth-email-signin" type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} autoComplete="email" /></div>
                  <div className="space-y-1.5"><Label htmlFor="checkout-auth-password-signin">Password</Label><Input id="checkout-auth-password-signin" type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} autoComplete="current-password" /></div>
                  {authError && <p role="alert" className="text-sm text-destructive">{authError}</p>}
                  <Button className="w-full" disabled={authBusy} onClick={submitAuth}>{authBusy ? "Signing in…" : "Sign in"}</Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Fulfillment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <RadioGroup value={fulfillment} onValueChange={v => setFulfillment(v as any)} aria-label="Fulfillment method">
              <div className="flex items-center gap-2 min-h-[44px]"><RadioGroupItem value="delivery" id="checkout-delivery" /><Label htmlFor="checkout-delivery">Delivery to my address</Label></div>
              <div className="flex items-center gap-2 min-h-[44px]"><RadioGroupItem value="pickup" id="checkout-pickup" /><Label htmlFor="checkout-pickup">Pickup from merchant</Label></div>
            </RadioGroup>
            {fulfillment === "delivery" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="checkout-address">Delivery address</Label>
                  <Input id="checkout-address" value={address} onChange={e => { setAddress(e.target.value); setErrors(prev => ({ ...prev, address: undefined })); }}
                    autoComplete="street-address" aria-invalid={!!errors.address} aria-describedby={errors.address ? "checkout-address-error" : undefined} />
                  {errors.address && <p id="checkout-address-error" role="alert" className="text-sm text-destructive">{errors.address}</p>}
                </div>
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={useGps}>Use current GPS location</Button>
                {lat && lng && <p className="text-xs text-muted-foreground tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</p>}
              </>
            )}
            <div className="space-y-1.5"><Label htmlFor="checkout-notes">Notes (optional)</Label><Textarea id="checkout-notes" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </CardContent>
        </Card>

        {Object.entries(groups).map(([mid, gItems]) => {
          const gSubtotal = gItems.reduce((s, i) => s + i.price * i.quantity, 0);
          const gFee = fees[mid] ?? 0;
          const merchantName = gItems[0].merchant_name || "Store";
          return (
            <Card key={mid}>
              <CardHeader className="py-3"><CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap"><span className="min-w-0 truncate">{merchantName}</span></CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-2 text-sm">
                {gItems.map(i => (
                  <div key={i.product_id} className="flex justify-between gap-3">
                    <span className="flex-1 min-w-0 truncate">{i.quantity}× {i.name}</span>
                    <span className="shrink-0 tabular-nums">{formatMoney((i.price * i.quantity))}</span>
                  </div>
                ))}
                <div className="border-t pt-2 space-y-1">
                  <Row label="Items subtotal" value={gSubtotal} />
                  <Row label={fulfillment === "delivery" ? "Delivery fee" : "Pickup"} value={gFee} />
                  <Row label="Order total" value={gSubtotal + gFee} bold />
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardHeader><CardTitle>Grand total</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="Items subtotal" value={subtotal} />
            <Row label="Total delivery fees" value={totalDeliveryFees} />
            <div className="border-t pt-2"><Row label="Total" value={total} bold /></div>
          </CardContent>
        </Card>

        <Button size="lg" className="w-full" disabled={submitting} onClick={submit}
          aria-describedby={!user ? "checkout-auth-hint" : undefined}>
          {!user ? "Create an account or sign in above to continue" : submitting ? "Placing orders…" : `Pay D ${total.toFixed(2)} with ModemPay`}
        </Button>
      </div>
    </StorefrontLayout>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-semibold text-base" : ""}`}>
      <span className="min-w-0 truncate">{label}</span><span className="shrink-0 tabular-nums">{formatMoney(value)}</span>
    </div>
  );
}
