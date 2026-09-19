import { useEffect, useRef, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { pageEmptyStates } from "@/lib/pageEmptyStates";
import { formatMoney } from "@/lib/finance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import PaymentStatusBadge from "@/components/PaymentStatusBadge";
import OrderChat from "@/components/OrderChat";
import { MessageCircle } from "lucide-react";
import { paginateList, unreadLabel } from "./merchantGroup.helpers";

const nextActions: Record<string, { label: string; to: string }[]> = {
  paid: [{ label: "Accept", to: "accepted" }],
  accepted: [{ label: "Start preparing", to: "preparing" }],
  preparing: [{ label: "Ready", to: "__ready" }],
};

const ACTIVE_STATUSES = ["paid", "accepted", "preparing", "ready", "dispatched", "picked_up", "in_transit", "delivered"];

export const ORDER_PAGE_SIZE = 10;

export default function MerchantOrdersPage() {
  const { user, hasRole } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [merchantIds, setMerchantIds] = useState<string[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Resolve which merchants this user manages (admins see all)
  useEffect(() => {
    if (!user) return;
    if (hasRole("admin")) { setMerchantIds(null); return; }
    supabase.from("merchants").select("id").eq("manager_user_id", user.id).then(({ data }) => {
      setMerchantIds((data || []).map((m: any) => m.id));
    });
  }, [user, hasRole]);

  const load = async () => {
    if (!user) return;
    let q = supabase
      .from("orders")
      .select("*, merchants(name,manager_user_id), order_items(*), customers(full_name,phone), deliveries(id,rider_id,status)")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false });
    if (merchantIds !== null) {
      if (merchantIds.length === 0) { setOrders([]); setLoading(false); return; }
      q = q.in("merchant_id", merchantIds);
    }
    const { data } = await q;
    setOrders(data || []);
    setLoading(false);

    // Load unread counts for these orders
    const ids = (data || []).map((o: any) => o.id);
    if (ids.length) {
      const { data: msgs } = await supabase
        .from("order_messages")
        .select("order_id,sender_user_id,read_at")
        .in("order_id", ids)
        .is("read_at", null);
      const counts: Record<string, number> = {};
      (msgs || []).forEach((m: any) => {
        if (m.sender_user_id !== user.id) counts[m.order_id] = (counts[m.order_id] || 0) + 1;
      });
      setUnread(counts);
    } else {
      setUnread({});
    }
  };

  // Debounced reload: order + message bursts collapse into one fetch.
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoad = useRef(() => {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => { load(); }, 350);
  });
  // Keep the debounced loader pointed at the latest merchant scope.
  useEffect(() => {
    scheduleLoad.current = () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      loadTimer.current = setTimeout(() => { load(); }, 350);
    };
  });

  useEffect(() => {
    if (merchantIds === undefined) return;
    load();
    const ch = supabase.channel("merch-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload: any) => {
        const row = payload.new || payload.old;
        // Scope realtime to this manager's merchants; admins see all.
        if (merchantIds && !merchantIds.includes(row?.merchant_id)) return;
        if (payload.eventType === "UPDATE" && payload.old?.status !== "paid" && payload.new?.status === "paid") {
          toast.success(`New paid order ${payload.new.order_reference || ""}`, { action: { label: "View orders", onClick: () => { window.location.href = "/merchant/orders"; } } });
        }
        scheduleLoad.current();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_messages" }, () => scheduleLoad.current())
      .subscribe();
    return () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, merchantIds]);

  useEffect(() => { setPage(0); }, [orders.length]);

  const transition = async (orderId: string, to: string) => {
    try {
      if (to === "__ready") {
        const { error } = await supabase.rpc("mark_order_ready", { _order_id: orderId });
        if (error) throw error;
        toast.success("Order ready — riders notified");
      } else {
        // Read-then-guarded-write: only transition if the status is still what we saw,
        // so two managers clicking simultaneously can't double-apply.
        const { data: cur } = await supabase.from("orders").select("status").eq("id", orderId).single();
        const { error, count } = await supabase.from("orders").update({ status: to }).eq("id", orderId).eq("status", cur?.status ?? "");
        if (error) throw error;
        if (count === 0) { toast.info("Order status already changed by someone else."); load(); return; }
      }
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const pages = Math.max(1, Math.ceil(orders.length / ORDER_PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = paginateList(orders, safePage, ORDER_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Incoming orders</h1>
        <Badge variant="secondary" className="text-xs">{orders.length} active</Badge>
      </div>
      {loading ? (
        <div role="status" aria-label="Loading orders" className="space-y-3">
          <div className="shimmer h-32 rounded-lg" aria-hidden="true" />
          <div className="shimmer h-32 rounded-lg" aria-hidden="true" />
          <div className="shimmer h-32 rounded-lg" aria-hidden="true" />
          <span className="sr-only">Loading orders…</span>
        </div>
      ) : orders.length === 0 ? (
        <Card><CardContent>
          <EmptyState {...pageEmptyStates.merchantOrders.list} />
        </CardContent></Card>
      ) : (
        <>
          {visible.map(o => (
            <MerchantOrderCard key={o.id} o={o} unread={unread[o.id] || 0} onTransition={transition} onChatOpened={() => setUnread(u => ({ ...u, [o.id]: 0 }))} />
          ))}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
              <span className="text-xs text-muted-foreground" role="status">Page {safePage + 1} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={safePage === 0} aria-label="Previous orders page" onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={safePage + 1 >= pages} aria-label="Next orders page" onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MerchantOrderCard({ o, unread, onTransition, onChatOpened }: { o: any; unread: number; onTransition: (id: string, to: string) => void; onChatOpened: () => void }) {
  // Chat stays closed until the merchant opens it. Unread arrivals surface as
  // a role=status badge so screen readers announce them without stealing focus.
  const [chatOpen, setChatOpen] = useState(false);
  const toggleChat = () => {
    setChatOpen(v => {
      const next = !v;
      if (next) onChatOpened();
      return next;
    });
  };
  const chatId = `order-chat-${o.id}`;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="text-base">{o.order_reference} · {o.merchants?.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {o.customers?.full_name} · {o.customers?.phone} · {o.fulfillment_type}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PaymentStatusBadge status={o.payment_status} />
          <Badge className="text-xs">{o.status.replace(/_/g, " ")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {o.status === "ready" && o.fulfillment_type === "delivery" && (
          <Badge variant="secondary" className="text-xs">
            {o.deliveries?.rider_id ? "Rider assigned — heading to you" : "Ready — finding a rider…"}
          </Badge>
        )}
        <OrderStatusTimeline status={o.status} fulfillmentType={o.fulfillment_type} className="py-2" />
        {o.order_items?.map((it: any) => (
          <div key={it.id} className="flex justify-between gap-2 text-sm">
            <span>{it.quantity}× {it.name_snapshot}</span>
            <span className="tabular-nums">{formatMoney(Number(it.line_total))}</span>
          </div>
        ))}
        {o.dropoff_address && <p className="text-xs text-muted-foreground">Deliver to: {o.dropoff_address}</p>}
        <div className="border-t pt-2 flex items-center justify-between flex-wrap gap-2">
          <span className="font-semibold tabular-nums">Total {formatMoney(Number(o.total))}</span>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={toggleChat} aria-expanded={chatOpen} aria-controls={chatId} className="relative">
              <MessageCircle className="h-4 w-4 mr-1" aria-hidden="true" /> {chatOpen ? "Hide chat" : "Message customer"}
              {unread > 0 && (
                <span role="status" aria-label={unreadLabel(unread)} className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-h-[20px] min-w-[20px]">{unread}</span>
              )}
            </Button>
            {(nextActions[o.status] || []).map(a => (
              <Button key={a.to} size="sm" onClick={() => onTransition(o.id, a.to)}>{a.label}</Button>
            ))}
          </div>
        </div>
        {chatOpen && <div id={chatId}><OrderChat orderId={o.id} senderRole="merchant" /></div>}
      </CardContent>
    </Card>
  );
}
