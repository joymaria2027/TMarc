import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, RefreshCw, RotateCw } from "lucide-react";

export default function WebhookEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [replaying, setReplaying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("modempay_webhook_events" as any)
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    if (status !== "all") query = query.eq("processing_status", status);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setEvents((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = events.filter((e) =>
    !q ||
    (e.event_type ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (e.payment_reference ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (e.order_id ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  const replay = async (id: string) => {
    setReplaying(id);
    try {
      const { data, error } = await supabase.functions.invoke("modempay-webhook-replay", { body: { event_id: id } });
      if (error) throw error;
      toast.success(`Replayed: ${data?.processing_status ?? "ok"}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReplaying(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">ModemPay webhook events</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2">
          <Input placeholder="Search event type, order id, or reference…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="duplicate">Duplicate</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="invalid_signature">Invalid signature</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No webhook events yet.</CardContent></Card>
      ) : filtered.map((e) => (
        <Collapsible key={e.id} asChild>
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger asChild>
                    <Button size="icon" variant="ghost"><ChevronDown className="h-4 w-4" /></Button>
                  </CollapsibleTrigger>
                  <div>
                    <CardTitle className="text-sm font-mono">{e.event_type ?? "unknown"}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(e.received_at).toLocaleString()} · order {e.order_id ? e.order_id.slice(0,8) : "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.processing_status} />
                  <SignatureBadge valid={e.signature_valid} />
                  <Button size="sm" variant="outline" disabled={replaying === e.id} onClick={() => replay(e.id)}>
                    <RotateCw className={`h-3 w-3 mr-1 ${replaying === e.id ? "animate-spin" : ""}`} /> Replay
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-2 text-xs pt-0">
                {e.processing_error && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-red-800 font-mono whitespace-pre-wrap">{e.processing_error}</div>
                )}
                <div className="grid grid-cols-2 gap-1">
                  <span className="text-muted-foreground">Event id</span><span className="font-mono truncate">{e.event_id ?? "—"}</span>
                  <span className="text-muted-foreground">Reference</span><span className="font-mono">{e.payment_reference ?? "—"}</span>
                  <span className="text-muted-foreground">Signature header</span><span className="font-mono truncate">{e.signature_header ?? "—"}</span>
                </div>
                <details>
                  <summary className="cursor-pointer font-medium">Payload</summary>
                  <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-96">{JSON.stringify(e.payload_json, null, 2)}</pre>
                </details>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    processed: "bg-green-100 text-green-800 border-green-300",
    duplicate: "bg-blue-100 text-blue-800 border-blue-300",
    ignored: "bg-gray-100 text-gray-700 border-gray-300",
    failed: "bg-red-100 text-red-800 border-red-300",
    invalid_signature: "bg-red-100 text-red-800 border-red-300",
    pending: "bg-amber-100 text-amber-800 border-amber-300",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

function SignatureBadge({ valid }: { valid: boolean | null }) {
  if (valid === null || valid === undefined) return <Badge variant="outline">no sig</Badge>;
  return valid
    ? <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">sig ok</Badge>
    : <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">sig bad</Badge>;
}
