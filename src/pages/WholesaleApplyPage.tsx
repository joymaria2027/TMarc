import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StorefrontLayout from "@/components/StorefrontLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Application {
  id: string; business_name: string; phone: string | null; address: string | null;
  approval_status: string; rejection_reason: string | null;
}

export default function WholesaleApplyPage() {
  const { user, loading: authLoading } = useAuth();
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await (supabase.from("wholesalers" as any)
      .select("id,business_name,phone,address,approval_status,rejection_reason")
      .eq("user_id", user.id).maybeSingle() as any);
    setApp((data as any) ?? null);
    setLoading(false);
  };
  useEffect(() => { if (!authLoading) load(); }, [user, authLoading]);

  const submit = async () => {
    if (!user) return;
    if (!businessName.trim()) { toast.error("Business name is required"); return; }
    setSaving(true);
    const { error } = await (supabase.from("wholesalers" as any).insert({
      user_id: user.id, business_name: businessName.trim(), phone: phone || null, address: address || null,
    }) as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Application submitted for review");
    load();
  };

  if (authLoading || loading) {
    return <StorefrontLayout><p className="text-muted-foreground">Loading…</p></StorefrontLayout>;
  }

  if (!user) {
    return (
      <StorefrontLayout>
        <Card className="max-w-lg mx-auto">
          <CardHeader><CardTitle>Become a wholesale buyer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create an account or sign in to apply for wholesale pricing.
            </p>
            <div className="flex gap-2">
              <Button asChild><Link to="/auth?as=wholesaler&tab=signup&next=/wholesale">Create account</Link></Button>
              <Button variant="outline" asChild><Link to="/auth?as=wholesaler&tab=signin&next=/wholesale">Sign in</Link></Button>
            </div>
          </CardContent>
        </Card>
      </StorefrontLayout>
    );
  }

  return (
    <StorefrontLayout>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Wholesale</p>
          <h1 className="font-display text-3xl tracking-tight">Wholesale account</h1>
        </div>

        {app ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{app.business_name}</CardTitle>
              <Badge variant={app.approval_status === "approved" ? "default" : app.approval_status === "rejected" ? "destructive" : "secondary"}>
                {app.approval_status === "approved" ? "Approved" : app.approval_status === "rejected" ? "Declined" : "Pending review"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {app.phone && <p className="text-muted-foreground">{app.phone}</p>}
              {app.address && <p className="text-muted-foreground">{app.address}</p>}
              {app.approval_status === "pending" && (
                <p className="text-muted-foreground">We are reviewing your application. Wholesale prices appear as soon as it is approved.</p>
              )}
              {app.approval_status === "rejected" && (
                <p className="text-destructive">Declined{app.rejection_reason ? `: ${app.rejection_reason}` : ""}</p>
              )}
              {app.approval_status === "approved" && (
                <>
                  <p className="text-muted-foreground">Wholesale prices are now shown across the shop.</p>
                  <Button asChild><Link to="/shop">Start buying</Link></Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Apply for wholesale pricing</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5"><Label>Business name</Label>
                <Input value={businessName} onChange={e => setBusinessName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Phone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Business address</Label>
                <Textarea value={address} onChange={e => setAddress(e.target.value)} /></div>
              <Button className="w-full" disabled={saving} onClick={submit}>
                {saving ? "Submitting…" : "Submit application"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </StorefrontLayout>
  );
}
