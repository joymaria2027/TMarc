import { useEffect, useState } from "react";
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

export default function CheckoutPage() {
  const { items, subtotal, clear, groups } = useCart();
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
  // inline auth at checkout
  const [authTab, setAuthTab] = useState<"signup" | "signin">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

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

  // resolve per-merchant delivery fee whenever fulfillment/address/groups change
  useEffect(() => {
    (async () => {
      const merchantIds = Object.keys(groups);
      if (fulfillment === "pickup") {
        setFees(Object.fromEntries(merchantIds.map(id => [id, 0])));
        return;
      }
      const entries = await Promise.all(merchantIds.map(async id => {
        const fee = await resolveDeliveryFee(id, address);
        return [id, fee] as const;
      }));
      setFees(Object.fromEntries(entries));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, address, items.length]);

  if (loading) return <StorefrontLayout><p>Loading…</p></StorefrontLayout>;
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
    if (!authEmail || !authPassword) return toast.error("Email and password required");
    setAuthBusy(true);
    try {
      if (authTab === "signup") {
        if (!fullName) { setAuthBusy(false); return toast.error("Enter your full name above first"); }
        await signUp(authEmail, authPassword, fullName);
        try { await supabase.rpc("self_assign_customer_role" as any); } catch {}
        toast.success("Account created — you can place your order now");
      } else {
        await signIn(authEmail, authPassword);
        toast.success("Signed in");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const submit = async () => {
    if (!fullName || !phone) return toast.error("Name and phone required");
    if (fulfillment === "delivery" && !address) return toast.error("Delivery address required");
    setSubmitting(true);
    try {
      // ensure customer row
      let { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
      if (!customer) {
        const { data: created, error: cErr } = await supabase
          .from("customers").insert({ user_id: user.id, full_name: fullName, phone }).select().single();
        if (cErr) throw cErr;
        customer = created;
      } else {
        await supabase.from("customers").update({
          full_name: fullName, phone, default_address: address,
          default_lat: lat, default_lng: lng,
        }).eq("id", customer.id);
      }

      // Create one order per merchant
      const merchantIds = Object.keys(groups);
      let firstRedirect: string | null = null;

      const orderIdsCreated: string[] = [];
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
        if (!firstRedirect && pay?.redirect_url && !pay?.stub) firstRedirect = pay.redirect_url;
      }

      clear();
      if (firstRedirect) {
        toast.success("Orders placed — redirecting to payment");
        window.location.href = firstRedirect;
      } else {
        toast.success(merchantIds.length > 1 ? `${merchantIds.length} orders placed` : "Order placed");
        navigate(orderIdsCreated.length === 1 ? `/checkout/status/${orderIdsCreated[0]}` : "/account/orders");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StorefrontLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="font-display text-3xl">Checkout</h1>

        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          </CardContent>
        </Card>

        {!user && (
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <p className="text-sm text-muted-foreground">Create an account or sign in to place your order. Your account lets you track orders and reorder faster.</p>
            </CardHeader>
            <CardContent>
              <Tabs value={authTab} onValueChange={v => setAuthTab(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                </TabsList>
                <TabsContent value="signup" className="space-y-3 mt-4">
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Password</Label><Input type="password" minLength={6} value={authPassword} onChange={e => setAuthPassword(e.target.value)} /></div>
                  <Button className="w-full" disabled={authBusy} onClick={submitAuth}>{authBusy ? "Creating…" : "Create account"}</Button>
                </TabsContent>
                <TabsContent value="signin" className="space-y-3 mt-4">
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} /></div>
                  <Button className="w-full" disabled={authBusy} onClick={submitAuth}>{authBusy ? "Signing in…" : "Sign in"}</Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Fulfillment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <RadioGroup value={fulfillment} onValueChange={v => setFulfillment(v as any)}>
              <div className="flex items-center gap-2"><RadioGroupItem value="delivery" id="d" /><Label htmlFor="d">Delivery to my address</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="pickup" id="p" /><Label htmlFor="p">Pickup from merchant</Label></div>
            </RadioGroup>
            {fulfillment === "delivery" && (
              <>
                <div className="space-y-1.5"><Label>Delivery address</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
                <Button type="button" variant="outline" size="sm" onClick={useGps}>Use current GPS location</Button>
                {lat && lng && <p className="text-xs text-muted-foreground">{lat.toFixed(5)}, {lng.toFixed(5)}</p>}
              </>
            )}
            <div className="space-y-1.5"><Label>Notes (optional)</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </CardContent>
        </Card>

        {Object.entries(groups).map(([mid, gItems]) => {
          const gSubtotal = gItems.reduce((s, i) => s + i.price * i.quantity, 0);
          const gFee = fees[mid] ?? 0;
          const merchantName = gItems[0].merchant_name || "Restaurant";
          return (
            <Card key={mid}>
              <CardHeader className="py-3"><CardTitle className="text-base">{merchantName}</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 space-y-2 text-sm">
                {gItems.map(i => (
                  <div key={i.product_id} className="flex justify-between">
                    <span>{i.quantity}× {i.name}</span>
                    <span>D {(i.price * i.quantity).toFixed(2)}</span>
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

        <Button size="lg" className="w-full" disabled={submitting || !user} onClick={submit}>
          {!user ? "Create an account or sign in above to continue" : submitting ? "Placing orders…" : `Pay D ${total.toFixed(2)} with ModemPay`}
        </Button>
      </div>
    </StorefrontLayout>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span>{label}</span><span>D {value.toFixed(2)}</span>
    </div>
  );
}
