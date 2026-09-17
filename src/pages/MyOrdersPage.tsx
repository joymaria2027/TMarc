import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import StorefrontLayout from "@/components/StorefrontLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import LiveDeliveryMap from "@/components/LiveDeliveryMap";
import PaymentStatusBadge from "@/components/PaymentStatusBadge";
import OrderChat from "@/components/OrderChat";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  pending_payment: "secondary", paid: "default", accepted: "default",
  preparing: "default", ready: "default", dispatched: "default",
  picked_up: "default", in_transit: "default",
  delivered: "default", cancelled: "destructive", refunded: "destructive",
};

export default function MyOrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});

  const fetchOrders = async (cid: string) => {
    const { data } = await supabase
      .from("orders")
      .select("*, merchants(name), order_items(*)")
      .eq("customer_id", cid)
      .order("created_at", { ascending: false });
    setOrders(data || []);
    const ids = (data || []).map((o: any) => o.id);
    if (ids.length && user) {
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
    }
  };

  useEffect(() => {
    if (!user) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: customer } = await supabase.from("customers").select("id").eq("user_id", user.id).maybeSingle();
      if (!customer) return setOrders([]);
      await fetchOrders(customer.id);

      channel = supabase
        .channel(`my-orders-${customer.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `customer_id=eq.${customer.id}` },
          (payload: any) => {
            setOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o));
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders", filter: `customer_id=eq.${customer.id}` },
          () => fetchOrders(customer.id)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_messages" },
          () => fetchOrders(customer.id)
        )
        .subscribe();
    })();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [user]);

  if (loading) return <StorefrontLayout><p>Loading…</p></StorefrontLayout>;
  if (!user) return <Navigate to="/auth?as=customer&next=/account/orders" replace />;

  return (
    <StorefrontLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="font-display text-3xl">My orders</h1>
        {orders.length === 0 ? (
          <p className="text-muted-foreground">No orders yet.</p>
        ) : orders.map(o => (
          <OrderCard
            key={o.id}
            o={o}
            unread={unread[o.id] || 0}
            onChatOpened={() => setUnread(u => ({ ...u, [o.id]: 0 }))}
          />
        ))}
      </div>
    </StorefrontLayout>
  );
}

function OrderCard({ o, unread, onChatOpened }: { o: any; unread: number; onChatOpened: () => void }) {
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
          <CardTitle className="text-base">{o.order_reference}</CardTitle>
          <p className="text-xs text-muted-foreground">{o.merchants?.name} · {new Date(o.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <PaymentStatusBadge status={o.payment_status} />
          <Badge variant={statusVariant[o.status] || "default"}>{o.status.replace(/_/g, " ")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!["pending_payment", "cancelled", "refunded"].includes(o.status) && (
          <OrderStatusTimeline status={o.status} fulfillmentType={o.fulfillment_type} className="py-2" />
        )}
        {o.fulfillment_type === "delivery" && ["picked_up", "in_transit"].includes(o.status) && o.delivery_id && (
          <LiveDeliveryMap orderId={o.id} deliveryId={o.delivery_id} />
        )}
        {o.order_items?.map((it: any) => (
          <div key={it.id} className="flex justify-between text-sm">
            <span>{it.quantity}× {it.name_snapshot}</span>
            <span>D {Number(it.line_total).toFixed(2)}</span>
          </div>
        ))}
        <div className="border-t pt-2 flex justify-between font-semibold">
          <span>{o.fulfillment_type === "delivery" ? "Delivery" : "Pickup"} · Total</span>
          <span>D {Number(o.total).toFixed(2)}</span>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={toggleChat} className="relative">
            <MessageCircle className="h-4 w-4 mr-1" /> {chatOpen ? "Hide messages" : "Message merchant"}
            {unread > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">{unread}</span>
            )}
          </Button>
        </div>
        {chatOpen && <OrderChat orderId={o.id} senderRole="customer" />}
      </CardContent>
    </Card>
  );
}
