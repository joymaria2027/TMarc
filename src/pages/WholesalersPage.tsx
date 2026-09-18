import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

interface Row {
  id: string; user_id: string; business_name: string; phone: string | null; address: string | null;
  approval_status: string; rejection_reason: string | null; created_at: string;
}

const FILTERS = ["pending", "approved", "rejected", "all"] as const;

export default function WholesalersPage() {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string; email: string }>>({});
  const [filter, setFilter] = useState<string>("pending");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState<Record<string, string>>({});
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
    if (status === "rejected" && !(reason[row.id] || "").trim()) {
      setReasonErrors(s => ({ ...s, [row.id]: "Add a reason so the applicant knows what to fix" }));
      return;
    }
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
  const pendingCount = rows.filter(r => r.approval_status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Wholesalers</h1>
          <p className="text-muted-foreground">Review wholesale buyer applications</p>
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter applications by status">
          {FILTERS.map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
              {f === "pending" && pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1 text-[11px] h-4 px-1.5 tabular-nums">{pendingCount}</Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-muted-foreground" role="status">Loading applications…</p>
        : visible.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground space-y-1" role="status">
            <p>No applications here.</p>
            <p className="text-sm">{filter === "pending" ? "New wholesale applications will appear here for review." : "Try a different status filter."}</p>
          </CardContent></Card>
        ) : (
          <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Business</TableHead>
                <TableHead scope="col">Contact</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Decline reason</TableHead>
                <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.business_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {profiles[r.user_id]?.full_name || "—"} · {profiles[r.user_id]?.email || ""}
                    </p>
                    {r.address && <p className="text-xs text-muted-foreground mt-0.5">{r.address}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.phone || "—"}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge className="text-xs" variant={r.approval_status === "approved" ? "default" : r.approval_status === "rejected" ? "destructive" : "secondary"}>
                        {r.approval_status}
                      </Badge>
                      {r.rejection_reason && <p className="text-destructive text-xs">Reason: {r.rejection_reason}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.approval_status !== "approved" ? (
                      <div className="space-y-1 min-w-44">
                        <Label htmlFor={`decline-reason-${r.id}`} className="sr-only">Reason for declining {r.business_name}</Label>
                        <Input
                          id={`decline-reason-${r.id}`}
                          placeholder="Reason (for declining)"
                          value={reason[r.id] || ""}
                          aria-invalid={!!reasonErrors[r.id]}
                          aria-describedby={reasonErrors[r.id] ? `decline-reason-${r.id}-error` : undefined}
                          onChange={e => {
                            setReason(s => ({ ...s, [r.id]: e.target.value }));
                            setReasonErrors(s => ({ ...s, [r.id]: "" }));
                          }}
                        />
                        {reasonErrors[r.id] && (
                          <p id={`decline-reason-${r.id}-error`} className="text-xs text-destructive">{reasonErrors[r.id]}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 flex-wrap justify-end">
                      {r.approval_status !== "approved" && (
                        <Button size="sm" aria-label={`Approve ${r.business_name}`} onClick={() => review(r, "approved")}>Approve</Button>
                      )}
                      {r.approval_status !== "rejected" && (
                        <Button size="sm" variant="outline" aria-label={`Decline ${r.business_name}`} onClick={() => review(r, "rejected")}>Decline</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
    </div>
  );
}
