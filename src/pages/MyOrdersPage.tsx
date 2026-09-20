import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import StorefrontLayout from "@/components/StorefrontLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import LiveDeliveryMap from "@/components/LiveDeliveryMap";
import PaymentStatusBadge from "@/components/PaymentStatusBadge";
import OrderChat from "@/components/OrderChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronLeft, MessageCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { haptics } from "@/lib/haptics";
import GiftReveal from "@/components/celebration/GiftReveal";
import { formatMoney } from "@/lib/finance";
import { filterOrders, type OrderTab } from "@/lib/orderGroups";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_payment: "secondary",
  paid: "default",
  accepted: "default",
  preparing: "secondary",
  ready: "default",
  dispatched: "default",
  picked_up: "default",
  in_transit: "default",
  delivered: "outline",
  cancelled: "destructive",
  refunded: "destructive",
};

function humanizeStatus(status: string): string {
  return status
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}


export default function MyOrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  // F8: last inbound message body per order — the collapsed chat header
  // previews it so the customer never taps blind.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [tab, setTab] = useState<OrderTab>("all");
  const [query, setQuery] = useState("");
  const prevStatuses = useRef<Record<string, string>>({});
  const orderIdsRef = useRef<string[]>([]);
  const lastFetchRef = useRef(0);

  const fetchOrders = useCallback(
    async (cid: string, opts?: { manual?: boolean }) => {
      // Throttle realtime refetch storms (order_messages * fires often)
      const now = Date.now();
      if (!opts?.manual && now - lastFetchRef.current < 1000) return;
      lastFetchRef.current = now;
      if (opts?.manual) setRefreshing(true);
      try {
        const { data } = await supabase
          .from("orders")
          // handover-code/03: the customer's own handover code travels with the
          // delivery embed (column-scoped; the code table itself is RLS-denied
          // and only surfaced here or via get_my_handover_code).
          .select("*, merchants(name), order_items(*), deliveries!orders_delivery_id_fkey(status, handover_code)")
          .eq("customer_id", cid)
          .order("created_at", { ascending: false });
        const next = data || [];
        // Announce status changes for VoiceOver
        next.forEach((o: any) => {
          const prev = prevStatuses.current[o.id];
          if (prev && prev !== o.status) {
            setAnnouncement(`Order ${o.order_reference} is now ${humanizeStatus(o.status)}`);
          }
          prevStatuses.current[o.id] = o.status;
        });
        setOrders(next);
        const ids = next.map((o: any) => o.id);
        orderIdsRef.current = ids;
        if (ids.length && user) {
          const { data: msgs } = await supabase
            .from("order_messages")
            .select("order_id,sender_user_id,read_at,body,created_at")
            .in("order_id", ids)
            .is("read_at", null);
          const counts: Record<string, number> = {};
          const newest: Record<string, { body: string; at: string }> = {};
          (msgs || []).forEach((m: any) => {
            if (m.sender_user_id !== user.id) {
              counts[m.order_id] = (counts[m.order_id] || 0) + 1;
              const at = m.created_at ?? "";
              if (!newest[m.order_id] || at > newest[m.order_id].at) {
                newest[m.order_id] = { body: m.body as string, at };
              }
            }
          });
          setPreviews((prev) => {
            const merged = { ...prev };
            for (const [oid, v] of Object.entries(newest)) merged[oid] = v.body;
            return merged;
          });
          setUnread((prev) => {
            // Announce + haptic only on growth (new inbound message)
            Object.entries(counts).forEach(([oid, n]) => {
              if ((prev[oid] || 0) < n) {
                const o = next.find((x: any) => x.id === oid);
                setAnnouncement(
                  `New message from merchant${o ? ` for order ${o.order_reference}` : ""}`
                );
                haptics.success();
              }
            });
            return counts;
          });
        } else {
          setUnread({});
        }
      } finally {
        if (opts?.manual) setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
      if (!customer) return setOrders([]);
      await fetchOrders(customer.id, { manual: true });

      channel = supabase
        .channel(`my-orders-${customer.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `customer_id=eq.${customer.id}` },
          (payload: any) => {
            setOrders((prev) => {
              const next = prev.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o));
              const changed = prev.find((o) => o.id === payload.new.id);
              if (changed && changed.status !== payload.new.status) {
                setAnnouncement(
                  `Order ${payload.new.order_reference ?? "updated"} is now ${humanizeStatus(payload.new.status)}`
                );
                // Gift-ceremony/03: the delivered moment gets weight; every
                // other transition keeps the neutral tick.
                if (payload.new.status === "delivered") void haptics.success();
                else haptics.selectionChanged();
              }
              return next;
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: `customer_id=eq.${customer.id}` },
          () => fetchOrders(customer.id)
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "order_messages" }, (payload: any) => {
          const oid = (payload.new as any)?.order_id ?? (payload.old as any)?.order_id;
          // Only refetch when the message belongs to one of my orders (avoid over-fetch)
          if (!oid || orderIdsRef.current.includes(oid)) {
            fetchOrders(customer.id);
          }
        })
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, fetchOrders]);

  const handleManualRefresh = async () => {
    if (!user) return;
    await haptics.impact("LIGHT");
    const { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
    if (customer) {
      await fetchOrders(customer.id, { manual: true });
      setAnnouncement("Orders refreshed");
    }
  };

  if (loading)
    return (
      <StorefrontLayout>
        <p role="status" aria-live="polite">
          Loading your orders…
        </p>
      </StorefrontLayout>
    );
  if (!user) return <Navigate to="/auth?as=customer&next=/account/orders" replace />;

  const visibleOrders = filterOrders(orders, { tab, query });

  return (
    <StorefrontLayout>
      {/* Single screen-reader announcer for realtime updates (per-card badges are plain, not live) */}
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
      <div className="max-w-xl mx-auto space-y-4" aria-busy={refreshing}>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              haptics.selectionChanged();
              if (window.history.length > 1) navigate(-1);
              else navigate("/shop");
            }}
            aria-label="Back to shop"
            className="-ml-2"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight flex-1">My orders</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={refreshing}
            aria-label="Refresh orders"
          >
            <RefreshCw className={`h-5 w-5 mr-1 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        {orders.length > 0 && (
          <>
            <p className="text-base leading-relaxed text-muted-foreground">
              {orders.length} {orders.length === 1 ? "order" : "orders"}
            </p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter orders">
              {(["all", "active", "past"] as OrderTab[]).map((t) => (
                <Button
                  key={t}
                  variant={tab === t ? undefined : "outline"}
                  size="sm"
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {t === "all" ? "All" : t === "active" ? "Active" : "Past"}
                </Button>
              ))}
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reference or merchant"
                aria-label="Search orders by reference or merchant"
                className="max-w-xs"
              />
            </div>
          </>
        )}
        {orders.length === 0 ? (
          <div className="space-y-2">
            <p role="status" className="text-base leading-relaxed text-muted-foreground">No orders yet.</p>
            <Button asChild>
              <Link to="/shop">Browse shop</Link>
            </Button>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="space-y-2">
            <p role="status" className="text-base leading-relaxed text-muted-foreground">
              No orders match this filter.
            </p>
            <Button variant="outline" size="sm" onClick={() => { setTab("all"); setQuery(""); }}>
              Clear filter
            </Button>
          </div>
        ) : (
          visibleOrders.map((o) => (              <OrderCard
                key={o.id}
                o={o}
                unread={unread[o.id] || 0}
                preview={previews[o.id]}
              onChatOpened={() => setUnread((u) => ({ ...u, [o.id]: 0 }))}
            />
          ))
        )}
      </div>
    </StorefrontLayout>
  );
}

function OrderCard({ o, unread, preview, onChatOpened }: { o: any; unread: number; preview?: string; onChatOpened: () => void }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const chatRegionId = `chat-${o.id}`;
  const unreadId = `unread-${o.id}`;
  // Parent supplies the preview while unread exists; the open chat keeps it
  // live after messages are read.
  const previewBody = livePreview ?? preview ?? null;

  const toggleChat = async () => {
    const next = !chatOpen;
    if (next) {
      await haptics.impact("LIGHT");
      onChatOpened();
    } else {
      await haptics.selectionChanged();
    }
    setChatOpen(next);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-relaxed">
            <span className="sr-only">Order </span>
            {o.order_reference}
          </h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground break-words">
            {o.merchants?.name} · <time dateTime={o.created_at}>{new Date(o.created_at).toLocaleString()}</time>
          </p>
          {/* F8: last-message preview — recognition over recall; no tap needed
              to learn what was said. Hidden from AT; the unread pill carries
              the count announcement. */}
          {!chatOpen && previewBody && (
            <p className="text-[13px] leading-snug text-muted-foreground/90 break-words" aria-hidden="true">
              {previewBody}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <PaymentStatusBadge status={o.payment_status} />
          <Badge variant={statusVariant[o.status] || "default"}>
            {humanizeStatus(o.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Afterglow (gift-ceremony/03): silent — this is a state display for
            already-delivered orders, not an event. The buzz belongs to the
            realtime transition above. */}
        {o.status === "delivered" && (
          <div className="rounded border border-success/40 bg-success/10 p-3">
            <GiftReveal
              silent
              title="Delivered"
              description={`Your order from ${o.merchants?.name ?? "the merchant"} arrived.`}
              icon={<CheckCircle2 className="h-5 w-5 text-success shrink-0" aria-hidden="true" />}
            />
          </div>
        )}
        {o.status === "pending_payment" && (
          <div className="rounded border border-warning/40 bg-warning/15 p-3 text-sm">
            <p className="font-medium">Waiting for payment</p>
            <p className="text-muted-foreground">Complete payment to notify the merchant.</p>
            <Button asChild size="sm" className="mt-2">
              <Link to={`/checkout/status/${o.id}`}>Pay now</Link>
            </Button>
          </div>
        )}
        {!["pending_payment", "cancelled", "refunded"].includes(o.status) && (
          <OrderStatusTimeline status={o.status} fulfillmentType={o.fulfillment_type} className="py-2" />
        )}
        {o.fulfillment_type === "delivery" &&
          ["accepted", "preparing", "ready", "dispatched"].includes(o.status) && (
            <p className="text-sm text-muted-foreground">
              Rider not assigned yet — live map appears once your order is picked up.
            </p>
          )}
        {o.fulfillment_type === "delivery" && ["picked_up", "in_transit"].includes(o.status) && o.delivery_id && (
          <LiveDeliveryMap orderId={o.id} deliveryId={o.delivery_id} />
        )}
        {/* handover-code/03: the customer IS the source of the completion code.
            Shown while the delivery is on the road; the server deletes the code
            on completion, so a delivered order renders no block. */}
        <HandoverCodeBlock delivery={o.deliveries} />
        <ul className="space-y-1">
          {o.order_items?.map((it: any) => (
            <li key={it.id} className="flex justify-between items-center gap-3 text-base leading-relaxed min-h-[44px] py-1">
              <span className="flex-1 min-w-0 break-words">
                {it.quantity}× {it.name_snapshot}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t pt-2 flex justify-between gap-3 font-semibold text-base leading-relaxed">
          <span>{o.fulfillment_type === "delivery" ? "Delivery" : "Pickup"} · Total</span>
          <span className="tabular-nums">
            {formatMoney(o.total)}
            <span className="sr-only"> total</span>
          </span>
        </div>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleChat}
            aria-expanded={chatOpen}
            aria-controls={chatRegionId}
            aria-describedby={unread > 0 ? unreadId : undefined}
            aria-label={`Message merchant about order ${o.order_reference ?? ""}`.trim()}
            className="relative"
          >
            <MessageCircle className="h-5 w-5 mr-1" aria-hidden="true" />
            Message merchant
            <ChevronDown
              className={`h-4 w-4 ml-1 transition-transform ${chatOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
            {unread > 0 && (
              <span
                id={unreadId}
                className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-w-5 min-h-5"
              >
                <span aria-hidden="true">{unread > 99 ? "99+" : unread}</span>
                <span className="sr-only">
                  {unread} unread message{unread === 1 ? "" : "s"}
                </span>
              </span>
            )}
          </Button>
        </div>
        {chatOpen && (
          <section id={chatRegionId} aria-label={`Messages for order ${o.order_reference}`}>
            <OrderChat
              orderId={o.id}
              senderRole="customer"
              onLastMessage={(msg) => setLivePreview(msg ? msg.body : null)}
            />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function HandoverCodeBlock({ delivery }: { delivery?: { status: string; handover_code: number | null } | null }) {
  const [copied, setCopied] = useState(false);

  // The server deletes the code row on completion, so delivered orders arrive
  // with handover_code = null — but render defensively anyway: no code, no block.
  if (!delivery || delivery.status === "delivered" || !delivery.handover_code) return null;

  const code = String(delivery.handover_code);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      void haptics.selectionChanged();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="handover-code"
      className="rounded border border-primary/40 bg-primary/5 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Handover code</p>
          <p className="text-muted-foreground">Share this code only with your rider — they must enter it to complete the delivery.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-2xl font-bold tracking-[0.3em] tabular-nums" aria-label={`Handover code ${code.slice(0, 3)} ${code.slice(3)}`}>
            {code.slice(0, 3)} {code.slice(3)}
          </span>
          <Button variant="outline" size="sm" onClick={copy} aria-label={`Copy handover code ${code.slice(0, 3)} ${code.slice(3)}`}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
