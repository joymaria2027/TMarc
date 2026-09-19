import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

export const AUDIT_PAGE_SIZE = 20;
export function paginateAudit<T>(rows: T[], page: number, pageSize = AUDIT_PAGE_SIZE): T[] {
  return rows.slice(page * pageSize, page * pageSize + pageSize);
}

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(0);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load({ silent: true }); }, 400);
  };

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dispatch_audit_log" }, (payload) => {
        // Patch state for the common case instead of a full 1000-row reload.
        const row = (payload as { new?: AuditRow }).new;
        if (row && row.id) {
          setRows(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev].slice(0, 1000)));
        } else {
          scheduleReload();
        }
      })
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T00:00:00`).getTime() + 86400000 : null;
    const filtered = rows.filter(r => {
      if (type !== "all" && r.event_type !== type) return false;
      const ts = new Date(r.created_at).getTime();
      if (fromTs !== null && !(ts >= fromTs)) return false;
      if (toTs !== null && !(ts < toTs)) return false;
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
  }, [rows, search, type, orders, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="font-display text-3xl">Dispatch audit log</h1>
        <Button variant="outline" size="sm" onClick={load} aria-label="Refresh audit log">
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-0 flex-1 basis-56">
          <Label htmlFor="audit-search" className="sr-only">Search by order reference</Label>
          <Input
            id="audit-search"
            placeholder="Search by order reference…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="max-w-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label htmlFor="audit-from" className="sr-only">Filter from date</Label>
            <Input
              id="audit-from"
              type="date"
              aria-label="Filter from date"
              value={from}
              onChange={e => { setFrom(e.target.value); setPage(0); }}
              className="max-w-[10rem]"
            />
          </div>
          <div>
            <Label htmlFor="audit-to" className="sr-only">Filter to date</Label>
            <Input
              id="audit-to"
              type="date"
              aria-label="Filter to date"
              value={to}
              min={from || undefined}
              onChange={e => { setTo(e.target.value); setPage(0); }}
              className="max-w-[10rem]"
            />
          </div>
          {(from || to) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setFrom(""); setTo(""); setPage(0); }}
              aria-label="Clear date filters"
            >
              Clear dates
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {EVENT_TYPES.map(t => (
            <Button key={t} size="sm" variant={type === t ? "default" : "outline"} aria-pressed={type === t} onClick={() => setType(t)}>
              {t === "all" ? "All events" : EVENT_LABEL[t]}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div role="status" aria-label="Loading audit entries" className="space-y-2">
          <Skeleton className="shimmer h-16 w-full rounded-lg" />
          <Skeleton className="shimmer h-16 w-full rounded-lg" />
          <span className="sr-only">Loading audit entries…</span>
        </div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No audit entries yet.</CardContent></Card>
      ) : (() => {
        const visible = paginateAudit(grouped, page);
        const pageCount = Math.max(1, Math.ceil(grouped.length / AUDIT_PAGE_SIZE));
        return (
          <>
            {visible.map(([key, events]) => {
        const ref = orders[key] || key.slice(0, 8);
        const isOpen = open[key] ?? false;
        const panelId = `audit-panel-${key.slice(0, 8)}`;
        return (
          <Card key={key}>
            <CardHeader className="py-3">
              <Button
                variant="ghost"
                className="flex w-full items-center justify-between gap-2 p-0 h-auto min-h-[44px] text-left"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} audit trail for order ${ref}, ${events.length} events`}
                onClick={() => setOpen(o => ({ ...o, [key]: !isOpen }))}
              >
                <CardTitle className="text-base flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                  {ref}
                  <Badge variant="secondary" className="tabular-nums">{events.length} events</Badge>
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  <time dateTime={events[0].created_at}>{new Date(events[0].created_at).toLocaleString()}</time>
                </span>
              </Button>
            </CardHeader>
            {isOpen && (
              <CardContent id={panelId} className="space-y-2">
                {[...events].reverse().map(e => (
                  <div key={e.id} className="border rounded-md p-2 text-sm flex flex-wrap items-center gap-2">
                    <Badge variant={eventVariant(e.event_type)}>{EVENT_LABEL[e.event_type] || e.event_type}</Badge>
                    <span className="text-xs text-muted-foreground"><time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString()}</time></span>
                    {e.rider_id && <span className="text-xs">Rider {riders[e.rider_id] || e.rider_id.slice(0, 8)}</span>}
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <code className="text-xs text-muted-foreground break-all">
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
            <div className="flex items-center justify-between gap-2 pt-2 flex-wrap" role="navigation" aria-label="Audit pages">
              <p className="text-xs text-muted-foreground tabular-nums" role="status">
                Page {page + 1} of {pageCount} · {grouped.length} orders
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
