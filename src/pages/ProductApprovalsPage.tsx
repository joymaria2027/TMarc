import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getProductImageUrl } from "@/lib/productImage";
import { toast } from "sonner";

export default function ProductApprovalsPage() {
  const { user, hasRole } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from("products")
      .select("*, merchants(name)")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true });
    setProducts(data || []);
    const urls: Record<string, string> = {};
    await Promise.all((data || []).map(async (p: any) => {
      const u = await getProductImageUrl(p.image_path);
      if (u) urls[p.id] = u;
    }));
    setImageUrls(urls);
  };
  useEffect(() => { load(); }, []);

  if (!hasRole("admin")) {
    return <p className="text-muted-foreground">Admin access required.</p>;
  }

  const approve = async (id: string) => {
    const { error } = await supabase.from("products").update({
      approval_status: "approved", approved_by: user!.id, approved_at: new Date().toISOString(), rejection_reason: null,
    }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Approved"); load(); }
  };
  const reject = async (id: string) => {
    const reason = reasons[id]?.trim();
    if (!reason) return toast.error("Provide a rejection reason");
    const { error } = await supabase.from("products").update({
      approval_status: "rejected", rejection_reason: reason,
    }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Rejected"); load(); }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Product approvals</h1>
      {products.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No pending products.</CardContent></Card>
      ) : products.map(p => (
        <Card key={p.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">{p.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{p.merchants?.name}</p>
            </div>
            <Badge variant="secondary">pending</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4">
              {imageUrls[p.id] && <img src={imageUrls[p.id]} alt={p.name} className="h-32 w-32 object-cover rounded" />}
              <div className="space-y-1 flex-1">
                {p.description && <p className="text-sm">{p.description}</p>}
                <p className="text-sm">Price: <strong>D {Number(p.price).toFixed(2)}</strong></p>
                {p.track_inventory && <p className="text-sm">Stock: {p.quantity}</p>}
              </div>
            </div>
            <Input placeholder="Rejection reason (required to reject)" value={reasons[p.id] || ""}
              onChange={e => setReasons(r => ({ ...r, [p.id]: e.target.value }))} />
            <div className="flex gap-2">
              <Button onClick={() => approve(p.id)}>Approve</Button>
              <Button variant="destructive" onClick={() => reject(p.id)}>Reject</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
