import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Row {
  id: string; user_id: string; business_name: string; phone: string | null; address: string | null;
  approval_status: string; rejection_reason: string | null; created_at: string;
}

export default function WholesalersPage() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; email: string }>>({});
  const [filter, setFilter] = useState<string>("pending");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await (supabase.from("wholesalers" as any)
      .select("id,user_id,business_name,phone,address,approval_status,rejection_reason,created_at")
      .order("created_at", { ascending: false }) as any);
    const list = ((data || []) as Row[]);
    setRows(list);
    const { data: profs } = await supabase.rpc("get_public_profiles" as any);
    const map: Record<string, { full_name: string; email: string }> = {};
    for (const p of ((profs || []) as any[])) map[p.user_id] = { full_name: p.full_name, email: p.email };
    setProfiles(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const review = async (row: Row, status: "approved" | "rejected") => {
    const payload: any = { approval_status: status, rejection_reason: status === "rejected" ? (reason[row.id] || null) : null };
    if (status === "approved") payload.approved_at = new Date().toISOString();
    const { error } = await (supabase.from("wholesalers" as any).update(payload).eq("id", row.id) as any);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "approved" ? "Wholesaler approved" : "Application declined");
    load();
  };

  if (!hasRole("admin")) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Admins only.</CardContent></Card>;
  }

  const visible = filter === "all" ? rows : rows.filter(r => r.approval_status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Admin</p>
          <h1 className="font-display text-3xl">Wholesalers</h1>
        </div>
        <div className="flex gap-2">
          {["pending", "approved", "rejected", "all"].map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p>
        : visible.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No applications here.</CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map(r => (
              <Card key={r.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{r.business_name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {profiles[r.user_id]?.full_name || "—"} · {profiles[r.user_id]?.email || ""}
                    </p>
                  </div>
                  <Badge variant={r.approval_status === "approved" ? "default" : r.approval_status === "rejected" ? "destructive" : "secondary"}>
                    {r.approval_status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {r.phone && <p className="text-muted-foreground">{r.phone}</p>}
                  {r.address && <p className="text-muted-foreground">{r.address}</p>}
                  {r.rejection_reason && <p className="text-destructive text-xs">Reason: {r.rejection_reason}</p>}
                  {r.approval_status !== "approved" && (
                    <Input placeholder="Reason (for declining)" value={reason[r.id] || ""}
                      onChange={e => setReason(s => ({ ...s, [r.id]: e.target.value }))} />
                  )}
                  <div className="flex gap-2 pt-1">
                    {r.approval_status !== "approved" && (
                      <Button size="sm" onClick={() => review(r, "approved")}>Approve</Button>
                    )}
                    {r.approval_status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => review(r, "rejected")}>Decline</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
