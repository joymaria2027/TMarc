import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/finance";
import { useParams, Link } from "react-router-dom";
import StorefrontLayout from "@/components/StorefrontLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PaymentStatusBadge from "@/components/PaymentStatusBadge";
import { Loader2, CheckCircle2, XCircle, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function humanizePaymentStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return "paid";
  if (s === "failed") return "failed";
  return "pending";
}

export default function CheckoutStatusPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [openingPayment, setOpeningPayment] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const prevStatus = useRef<string | null>(null);

  const load = async () => {
    if (!orderId) return;
    const { data } = await supabase
      .from("orders")
      .select("*, merchants(name)")
      .eq("id", orderId)
      .maybeSingle();
    setOrder(data);
    const next = ((data as any)?.payment_status ?? "pending").toLowerCase();
    if (prevStatus.current && prevStatus.current !== next) {
      setAnnouncement(`Payment is now ${humanizePaymentStatus(next)}`);
    }
    prevStatus.current = next;
  };

  useEffect(() => {
    load();
    if (!orderId) return;
    const ch = supabase
      .channel(`order-status-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => load(),
      )
      .subscribe();
    const iv = setInterval(load, 5000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
  }, [orderId]);

  if (!order) {
    return (
      <StorefrontLayout>
        <div role="status" aria-live="polite" className="max-w-xl mx-auto space-y-3 p-2">
          <span className="sr-only">Loading your order…</span>
          <div className="flex items-center gap-2 p-8" aria-hidden="true">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your order…
          </div>
          <div className="shimmer h-40 rounded-lg" aria-hidden="true" />
        </div>
      </StorefrontLayout>
    );
  }

  const status = (order.payment_status ?? "pending").toLowerCase();

  const openPayment = async () => {
    if (!orderId) return;
    setOpeningPayment(true);
    try {
      const { data, error } = await supabase.functions.invoke("modempay-create-checkout", {
        body: { order_id: orderId, return_url: `${window.location.origin}/checkout/status/${orderId}` },
      });
      if (error) throw error;
      if (!data?.redirect_url) throw new Error("ModemPay did not return a payment link");
      window.location.href = data.redirect_url;
    } catch (e: any) {
      toast.error(e.message || "Could not open ModemPay");
      setOpeningPayment(false);
    }
  };

  return (
    <StorefrontLayout>
      {/* Screen-reader announcements for payment-status changes */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
              <span className="min-w-0 truncate">Order {order.order_reference}</span>
              <PaymentStatusBadge status={order.payment_status} />
            </CardTitle>
            <p className="text-sm text-muted-foreground truncate">{order.merchants?.name}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {status === "pending" && (
              <div role="status" className="flex items-center gap-3 p-4 bg-warning/15 border border-warning/40 dark:bg-warning/25 rounded">
                <Loader2 className="h-5 w-5 animate-spin text-warning-foreground shrink-0" aria-hidden="true" />
                <div className="text-sm min-w-0">
                  <p className="font-medium">Waiting for payment confirmation</p>
                  <p className="text-muted-foreground">
                    This page updates automatically once ModemPay confirms your payment. If the ModemPay checkout did not open, reopen it below.
                  </p>
                </div>
              </div>
            )}
            {status === "paid" && (
              <div role="status" className="flex items-center gap-3 p-4 bg-success/10 border border-success/40 dark:bg-success/25 rounded">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" aria-hidden="true" />
                <div className="text-sm min-w-0">
                  <p className="font-medium">Payment confirmed</p>
                  <p className="text-muted-foreground">The merchant has been notified and will start preparing your order.</p>
                </div>
              </div>
            )}
            {status === "failed" && (
              <div role="alert" className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/40 dark:bg-destructive/20 rounded">
                <XCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
                <div className="text-sm min-w-0">
                  <p className="font-medium">Payment failed</p>
                  <p className="text-muted-foreground">Your order is saved. Retry payment below or track it in My orders.</p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
              <span className="text-muted-foreground">Subtotal</span><span className="text-right tabular-nums">{formatMoney(Number(order.subtotal))}</span>
              <span className="text-muted-foreground">Delivery fee</span><span className="text-right tabular-nums">{formatMoney(Number(order.delivery_fee))}</span>
              <span className="font-medium">Total</span><span className="text-right font-medium tabular-nums">{formatMoney(Number(order.total))}</span>
              {order.payment_reference && (<><span className="text-muted-foreground">Reference</span><span className="text-right font-mono text-xs truncate">{order.payment_reference}</span></>)}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              {status === "pending" && (
                <>
                  <Button variant="outline" className="flex-1" onClick={load}>
                    <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" /> Refresh
                  </Button>
                  <Button className="flex-1" onClick={openPayment} disabled={openingPayment}>
                    {openingPayment ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />}
                    Open ModemPay
                  </Button>
                </>
              )}
              {status === "failed" && (
                <Button className="flex-1" onClick={openPayment} disabled={openingPayment}>
                  {openingPayment ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />}
                  Retry payment
                </Button>
              )}
              <Button asChild variant={status === "paid" || status === "failed" ? undefined : "outline"} className="flex-1"><Link to="/account/orders">My orders</Link></Button>
              {status !== "pending" && <Button asChild variant="outline" className="flex-1"><Link to="/shop">Keep shopping</Link></Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    </StorefrontLayout>
  );
}
