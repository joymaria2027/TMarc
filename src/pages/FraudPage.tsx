import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Shield, AlertTriangle, MapPin, Plus, RefreshCw, ChevronDown, CheckCircle2, AlertOctagon, Info } from 'lucide-react';

type Severity = 'critical' | 'warning' | 'info';
type Check = { key: string; label: string; severity: Severity; count: number; sample: any[] };
type Report = { generated_at: string; checks: Check[]; acknowledged: Record<string, string[]> };

const sevMeta: Record<Severity, { color: string; Icon: any; label: string }> = {
  critical: { color: 'bg-destructive text-destructive-foreground', Icon: AlertOctagon, label: 'Critical' },
  warning:  { color: 'bg-amber-500 text-white', Icon: AlertTriangle, label: 'Warning' },
  info:     { color: 'bg-blue-500 text-white', Icon: Info, label: 'Info' },
};

function entityIdOf(check: string, row: any): string {
  return String(row.id ?? row.delivery_id ?? row.tx_id ?? row.withdrawal_id ?? row.wallet_id ?? row.expense_id ?? row.rider_expense_id ?? row.reference ?? '');
}

export default function FraudPage() {
  const [flagged, setFlagged] = useState<any[]>([]);
  const [serviceAreas, setServiceAreas] = useState<any[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius: '20' });

  const load = async () => {
    const [fRes, sRes] = await Promise.all([
      supabase.from('deliveries').select('*').eq('is_flagged', true).order('created_at', { ascending: false }),
      supabase.from('service_areas').select('*'),
    ]);
    setFlagged(fRes.data || []);
    setServiceAreas(sRes.data || []);
    setLoading(false);
  };

  const runAudit = useCallback(async () => {
    setAuditing(true);
    const { data, error } = await supabase.rpc('fraud_audit_report' as any);
    setAuditing(false);
    if (error) { toast.error(error.message); return; }
    setReport(data as unknown as Report);
  }, []);

  useEffect(() => {
    load();
    runAudit();
    const channel = supabase
      .channel('fraud-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_areas' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [runAudit]);

  const addServiceArea = async () => {
    const { error } = await supabase.from('service_areas').insert({
      name: form.name,
      center_latitude: parseFloat(form.lat),
      center_longitude: parseFloat(form.lng),
      radius_km: parseFloat(form.radius),
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Service area added');
    setOpen(false);
    const { data } = await supabase.from('service_areas').select('*');
    setServiceAreas(data || []);
  };

  const unflag = async (id: string) => {
    await supabase.from('deliveries').update({ is_flagged: false, flag_reason: null }).eq('id', id);
    setFlagged(prev => prev.filter(d => d.id !== id));
    toast.success('Delivery unflagged');
  };

  const acknowledge = async (check_key: string, entity_id: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from('audit_acknowledgements').insert({
      check_key, entity_id, acknowledged_by: u.user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Acknowledged');
    runAudit();
  };

  const checks = report?.checks ?? [];
  const ack = report?.acknowledged ?? {};
  const counts = checks.reduce((acc, c) => {
    if (!c || !c.count) return acc;
    const acked = (ack[c.key] || []).length;
    const open = Math.max(0, c.count - acked);
    if (open > 0) acc[c.severity] = (acc[c.severity] || 0) + open;
    return acc;
  }, {} as Record<Severity, number>);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fraud Prevention</h1>
          <p className="text-muted-foreground">Systems audit, service areas and flagged deliveries</p>
        </div>
        <Button onClick={runAudit} disabled={auditing} size="sm">
          <RefreshCw className={`h-4 w-4 mr-1 ${auditing ? 'animate-spin' : ''}`} />
          Run audit
        </Button>
      </div>

      {/* Systems audit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Systems Audit — Fund Integrity</span>
            <div className="flex gap-2 text-xs">
              <Badge className={sevMeta.critical.color}>{counts.critical || 0} Critical</Badge>
              <Badge className={sevMeta.warning.color}>{counts.warning || 0} Warning</Badge>
              <Badge className={sevMeta.info.color}>{counts.info || 0} Info</Badge>
            </div>
          </CardTitle>
          {report?.generated_at && (
            <p className="text-xs text-muted-foreground">Last scan: {new Date(report.generated_at).toLocaleString()}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {checks.length === 0 && !auditing && (
            <p className="text-sm text-muted-foreground text-center py-4">No audit data — click Run audit.</p>
          )}
          {checks.map(c => {
            if (!c) return null;
            const ackIds = new Set(ack[c.key] || []);
            const openSample = (c.sample || []).filter(r => !ackIds.has(entityIdOf(c.key, r)));
            const openCount = Math.max(0, c.count - ackIds.size);
            const M = sevMeta[c.severity];
            if (openCount === 0) {
              return (
                <div key={c.key} className="flex items-center justify-between py-2 border-b last:border-0 opacity-60">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span>{c.label}</span>
                  </div>
                  <Badge variant="secondary">OK</Badge>
                </div>
              );
            }
            return (
              <Collapsible key={c.key}>
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-sm">
                    <M.Icon className="h-4 w-4" />
                    <span className="font-medium">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={M.color}>{openCount}</Badge>
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost"><ChevronDown className="h-4 w-4" /></Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent className="bg-muted/40 px-3 py-2 space-y-1">
                  {openSample.slice(0, 20).map((row, i) => {
                    const id = entityIdOf(c.key, row);
                    return (
                      <div key={`${id}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                        <code className="truncate font-mono">{JSON.stringify(row)}</code>
                        {id && (
                          <Button size="sm" variant="outline" onClick={() => acknowledge(c.key, id)}>
                            Ack
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {openCount > openSample.length && (
                    <p className="text-xs text-muted-foreground">+{openCount - openSample.length} more (truncated)</p>
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Service Areas</CardTitle>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Service Area</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Center Lat</Label><Input type="number" step="any" value={form.lat} onChange={e => setForm(p => ({ ...p, lat: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Center Lng</Label><Input type="number" step="any" value={form.lng} onChange={e => setForm(p => ({ ...p, lng: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>Radius (km)</Label><Input type="number" value={form.radius} onChange={e => setForm(p => ({ ...p, radius: e.target.value }))} /></div>
                  <Button onClick={addServiceArea} className="w-full">Add Service Area</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {serviceAreas.map(sa => (
              <div key={sa.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{sa.name}</p>
                    <p className="text-xs text-muted-foreground">{sa.radius_km} km radius</p>
                  </div>
                </div>
                <Badge variant={sa.is_active ? 'default' : 'secondary'}>{sa.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
            ))}
            {serviceAreas.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No service areas defined</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Flagged Deliveries ({flagged.length})</CardTitle></CardHeader>
          <CardContent>
            {flagged.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    {d.order_reference || d.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.flag_reason}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => unflag(d.id)}>Unflag</Button>
              </div>
            ))}
            {flagged.length === 0 && (
              <div className="text-center py-4">
                <Shield className="h-8 w-8 mx-auto mb-2 text-accent opacity-50" />
                <p className="text-sm text-muted-foreground">No flagged deliveries</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
