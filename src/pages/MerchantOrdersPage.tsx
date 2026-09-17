import { useEffect, useState } from "react";
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

const nextActions: Record<string, { label: string; to: string }[]> = {
  paid: [{ label: "Accept", to: "accepted" }],
  accepted: [{ label: "Start preparing", to: "preparing" }],
  preparing: [{ label: "Ready", to: "__ready" }],
};

const ACTIVE_STATUSES = ["paid", "accepted", "preparing", "ready", "dispatched", "picked_up", "in_transit", "delivered"];

export default function MerchantOrdersPage() {
  const { user, hasRole } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [merchantIds, setMerchantIds] = useState<string[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});

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
      if (merchantIds.length === 0) { setOrders([]); return; }
      q = q.in("merchant_id", merchantIds);
    }
    const { data } = await q;
    setOrders(data || []);

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

  useEffect(() => {
    if (merchantIds === undefined) return;
    load();
    const ch = supabase.channel("merch-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload: any) => {
        const row = payload.new || payload.old;
        if (merchantIds && !merchantIds.includes(row?.merchant_id)) return;
        if (payload.eventType === "UPDATE" && payload.old?.status !== "paid" && payload.new?.status === "paid") {
          toast.success(`New paid order ${payload.new.order_reference || ""}`);
        }
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, merchantIds]);

  const transition = async (orderId: string, to: string) => {
    try {
      if (to === "__ready") {
        const { error } = await supabase.rpc("mark_order_ready", { _order_id: orderId });
        if (error) throw error;
        toast.success("Order ready — riders notified");
      } else {
        const { error } = await supabase.from("orders").update({ status: to }).eq("id", orderId);
        if (error) throw error;
      }
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Incoming orders</h1>
      {orders.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No active orders.</CardContent></Card>
      ) : orders.map(o => (
        <MerchantOrderCard key={o.id} o={o} unread={unread[o.id] || 0} onTransition={transition} onChatOpened={() => setUnread(u => ({ ...u, [o.id]: 0 }))} />
      ))}
    </div>
  );
}

function MerchantOrderCard({ o, unread, onTransition, onChatOpened }: { o: any; unread: number; onTransition: (id: string, to: string) => void; onChatOpened: () => void }) {
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    if (unread > 0 && !chatOpen) setChatOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);
  const toggleChat = () => {
    setChatOpen(v => {
      const next = !v;
      if (next) onChatOpened();
      return next;
    });
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{o.order_reference} · {o.merchants?.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {o.customers?.full_name} · {o.customers?.phone} · {o.fulfillment_type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={o.payment_status} />
          <Badge>{o.status.replace(/_/g, " ")}</Badge>
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
          <div key={it.id} className="flex justify-between text-sm">
            <span>{it.quantity}× {it.name_snapshot}</span>
            <span>D {Number(it.line_total).toFixed(2)}</span>
          </div>
        ))}
        {o.dropoff_address && <p className="text-xs text-muted-foreground">Deliver to: {o.dropoff_address}</p>}
        <div className="border-t pt-2 flex items-center justify-between flex-wrap gap-2">
          <span className="font-semibold">Total D {Number(o.total).toFixed(2)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleChat} className="relative">
              <MessageCircle className="h-4 w-4 mr-1" /> {chatOpen ? "Hide chat" : "Message customer"}
              {unread > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">{unread}</span>
              )}
            </Button>
            {(nextActions[o.status] || []).map(a => (
              <Button key={a.to} size="sm" onClick={() => onTransition(o.id, a.to)}>{a.label}</Button>
            ))}
          </div>
        </div>
        {chatOpen && <OrderChat orderId={o.id} senderRole="merchant" />}
      </CardContent>
    </Card>
  );
}
