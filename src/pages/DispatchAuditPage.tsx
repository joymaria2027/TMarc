import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

interface AuditRow {
  id: string;
  order_id: string | null;
  delivery_id: string | null;
  rider_id: string | null;
  event_type: string;
  detail: any;
  actor_user_id: string | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  order_paid: "Payment received",
  dispatch_offered: "Dispatch offered",
  rider_accepted: "Rider accepted",
  rider_rejected: "Rider rejected",
  rider_cancelled: "Rider cancelled acceptance",
  order_status: "Order status",
  delivery_status: "Delivery status",
};

const EVENT_TYPES = ["all", ...Object.keys(EVENT_LABEL)];

function eventVariant(t: string): "default" | "secondary" | "destructive" | "outline" {
  if (t === "rider_rejected" || t === "rider_cancelled") return "destructive";
  if (t === "rider_accepted" || t === "order_paid") return "default";
  return "secondary";
}

export default function DispatchAuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [riders, setRiders] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dispatch_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    const list = (data || []) as AuditRow[];
    setRows(list);

    const orderIds = [...new Set(list.map(r => r.order_id).filter(Boolean))] as string[];
    if (orderIds.length) {
      const { data: os } = await supabase.from("orders").select("id,order_reference").in("id", orderIds);
      setOrders(Object.fromEntries((os || []).map((o: any) => [o.id, o.order_reference || o.id.slice(0, 8)])));
    }
    const riderIds = [...new Set(list.map(r => r.rider_id).filter(Boolean))] as string[];
    if (riderIds.length) {
      const { data: rs } = await supabase.from("riders").select("id,rider_code").in("id", riderIds);
      setRiders(Object.fromEntries((rs || []).map((r: any) => [r.id, r.rider_code])));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("dispatch-audit")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dispatch_audit_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(r => {
      if (type !== "all" && r.event_type !== type) return false;
      if (!q) return true;
      const ref = r.order_id ? (orders[r.order_id] || "") : "";
      return ref.toLowerCase().includes(q) || (r.order_id || "").includes(q);
    });
    const map = new Map<string, AuditRow[]>();
    filtered.forEach(r => {
      const key = r.order_id || r.delivery_id || "unlinked";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return [...map.entries()].sort(
      (a, b) => new Date(b[1][0].created_at).getTime() - new Date(a[1][0].created_at).getTime()
    );
  }, [rows, search, type, orders]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-display text-3xl">Dispatch audit log</h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search by order reference…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {EVENT_TYPES.map(t => (
            <Button key={t} size="sm" variant={type === t ? "default" : "outline"} onClick={() => setType(t)}>
              {t === "all" ? "All events" : EVENT_LABEL[t]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No audit entries yet.</CardContent></Card>
      ) : grouped.map(([key, events]) => {
        const ref = orders[key] || key.slice(0, 8);
        const isOpen = open[key] ?? false;
        return (
          <Card key={key}>
            <CardHeader
              className="cursor-pointer flex flex-row items-center justify-between py-3"
              onClick={() => setOpen(o => ({ ...o, [key]: !isOpen }))}
            >
              <CardTitle className="text-base flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {ref}
                <Badge variant="secondary">{events.length} events</Badge>
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {new Date(events[0].created_at).toLocaleString()}
              </span>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-2">
                {[...events].reverse().map(e => (
                  <div key={e.id} className="border rounded-md p-2 text-sm flex flex-wrap items-center gap-2">
                    <Badge variant={eventVariant(e.event_type)}>{EVENT_LABEL[e.event_type] || e.event_type}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                    {e.rider_id && <span className="text-xs">Rider {riders[e.rider_id] || e.rider_id.slice(0, 8)}</span>}
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <code className="text-[11px] text-muted-foreground break-all">
                        {JSON.stringify(e.detail)}
                      </code>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
