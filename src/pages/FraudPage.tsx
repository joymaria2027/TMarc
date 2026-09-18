import { useState, useEffect, useCallback, useRef } from 'react';
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
import { entityIdOf, formatMoney, validateServiceArea } from '@/lib/finance';
import { guardedWrite } from '@/lib/guardedWrite';

type Severity = 'critical' | 'warning' | 'info';
type Check = { key: string; label: string; severity: Severity; count: number; sample: any[] };
type Report = { generated_at: string; checks: Check[]; acknowledged: Record<string, string[]> };

const sevMeta: Record<Severity, { color: string; Icon: any; label: string }> = {
  critical: { color: 'bg-destructive text-destructive-foreground', Icon: AlertOctagon, label: 'Critical' },
  warning:  { color: 'bg-warning text-warning-foreground', Icon: AlertTriangle, label: 'Warning' },
  info:     { color: 'bg-info text-info-foreground', Icon: Info, label: 'Info' },
};

export default function FraudPage() {
  const [flagged, setFlagged] = useState<any[]>([]);
  const [serviceAreas, setServiceAreas] = useState<any[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', radius: '20' });
  const [formError, setFormError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 600);
  };

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_areas' }, () => scheduleReload())
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [runAudit]);

  const addServiceArea = async () => {
    const err = validateServiceArea(form);
    if (err) { setFormError(err); return; }
    setFormError(null);
    const { error } = await supabase.from('service_areas').insert({
      name: form.name.trim(),
      center_latitude: parseFloat(form.lat),
      center_longitude: parseFloat(form.lng),
      radius_km: parseFloat(form.radius),
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Service area added');
    setOpen(false);
    setForm({ name: '', lat: '', lng: '', radius: '20' });
    const { data } = await supabase.from('service_areas').select('*');
    setServiceAreas(data || []);
  };

  const unflag = async (id: string) => {
    const { error } = await guardedWrite(
      supabase.from('deliveries').update({ is_flagged: false, flag_reason: null }).eq('id', id),
      { context: 'Unflag failed' },
    );
    if (error) return;
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

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading fraud prevention">
      <div className="shimmer h-24 rounded-md" aria-hidden="true" />
      <div className="shimmer h-64 rounded-md" aria-hidden="true" />
      <span className="sr-only">Loading fraud prevention…</span>
    </div>
  );

  return (
    <div className="space-y-6" aria-busy={loading || auditing}>
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
              {(counts.critical || counts.warning || counts.info) ? (
                <>
                  {!!counts.critical && <Badge className={sevMeta.critical.color}>{counts.critical} Critical</Badge>}
                  {!!counts.warning && <Badge className={sevMeta.warning.color}>{counts.warning} Warning</Badge>}
                  {!!counts.info && <Badge className={sevMeta.info.color}>{counts.info} Info</Badge>}
                </>
              ) : (
                <Badge className="bg-success/10 text-success border-success/30 gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />All clear
                </Badge>
              )}
            </div>
          </CardTitle>
          {report?.generated_at && (
            <p className="text-xs text-muted-foreground">Last scan: <time dateTime={report.generated_at}>{new Date(report.generated_at).toLocaleString()}</time></p>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {checks.length === 0 && !auditing && (
            <div className="text-center py-4">
              <p className="font-medium">No audit results yet</p>
              <p className="text-sm text-muted-foreground mt-1">Run an audit to scan wallets, settlements and withdrawals for mismatches.</p>
              <Button size="sm" className="mt-3" onClick={runAudit}>Run your first audit</Button>
            </div>
          )}
          {checks.map(c => {
            if (!c) return null;
            const ackIds = new Set(ack[c.key] || []);
            const openSample = (c.sample || []).filter(r => !ackIds.has(entityIdOf(c.key, r)));
            const openCount = Math.max(0, c.count - ackIds.size);
            // RPC/DB severities are not constrained to the three known keys —
            // fall back instead of white-screening on M.Icon of undefined.
            const M = sevMeta[c.severity] ?? sevMeta.info;
            if (openCount === 0) {
              return (
                <div key={c.key} className="flex items-center justify-between py-2 border-b last:border-0 opacity-60">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
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
                    <M.Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="font-medium">{c.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${M.color} tabular-nums`}>{openCount}</Badge>
                    <CollapsibleTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label={`Show ${c.label} rows`}><ChevronDown className="h-4 w-4" aria-hidden="true" /></Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent className="bg-muted/40 px-3 py-2 space-y-1">
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-3">Entity</th>
                        <th className="py-1 pr-3">Detail</th>
                        <th className="py-1 pr-3 text-right">Amount</th>
                        <th className="py-1 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                  {openSample.slice(0, 20).map((row: any, i) => {
                    const id = entityIdOf(c.key, row);
                    const detail = String(row.description ?? row.reason ?? row.flag_reason ?? row.status ?? row.check ?? c.label);
                    const amt = row.amount != null ? formatMoney(row.amount) : '—';
                    return (
                      <tr key={`${id}-${i}`} className="border-t">
                        <td className="py-1.5 pr-3 font-mono text-[11px]">{id ? id.slice(0, 8) : '—'}</td>
                        <td className="py-1.5 pr-3 max-w-[280px] truncate">{detail}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{amt}</td>
                        <td className="py-1.5 text-right">
                        {id && (
                          <Button size="sm" variant="outline" onClick={() => acknowledge(c.key, id)} aria-label={`Acknowledge ${c.label} ${id.slice(0, 8)}`}>
                            Acknowledge
                          </Button>
                        )}
                        </td>
                      </tr>
                    );
                  })}
                    </tbody>
                  </table>
                  </div>
                  {openCount > openSample.length && (
                    <p className="text-xs text-muted-foreground">+{openCount - openSample.length} more (showing first {openSample.length}; run audit after acknowledging).</p>
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
                  <div className="space-y-2"><Label htmlFor="sa-name">Name</Label><Input id="sa-name" value={form.name} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setFormError(null); }} aria-invalid={!!formError} aria-describedby={formError ? 'sa-form-error' : undefined} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2"><Label htmlFor="sa-lat">Center Lat</Label><Input id="sa-lat" type="number" step="any" value={form.lat} onChange={e => { setForm(p => ({ ...p, lat: e.target.value })); setFormError(null); }} aria-invalid={!!formError} aria-describedby={formError ? 'sa-form-error' : undefined} className="tabular-nums" /></div>
                    <div className="space-y-2"><Label htmlFor="sa-lng">Center Lng</Label><Input id="sa-lng" type="number" step="any" value={form.lng} onChange={e => { setForm(p => ({ ...p, lng: e.target.value })); setFormError(null); }} aria-invalid={!!formError} aria-describedby={formError ? 'sa-form-error' : undefined} className="tabular-nums" /></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="sa-radius">Radius (km)</Label><Input id="sa-radius" type="number" min="0.1" step="any" value={form.radius} onChange={e => { setForm(p => ({ ...p, radius: e.target.value })); setFormError(null); }} aria-invalid={!!formError} aria-describedby={formError ? 'sa-form-error' : undefined} className="tabular-nums" /></div>
                  {formError && <p id="sa-form-error" role="alert" className="text-sm text-destructive">{formError}</p>}
                  <Button onClick={addServiceArea} className="w-full">Add Service Area</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {serviceAreas.map(sa => (
              <div key={sa.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{sa.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{sa.radius_km} km radius</p>
                  </div>
                </div>
                <Badge variant={sa.is_active ? 'default' : 'secondary'}>{sa.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
            ))}
            {serviceAreas.length === 0 && (
              <div className="text-center py-4">
                <p className="font-medium">No service areas yet</p>
                <p className="text-sm text-muted-foreground mt-1">Define a delivery zone so out-of-area trips get flagged automatically.</p>
                <Button size="sm" className="mt-3" onClick={() => setOpen(true)}>Add your first zone</Button>
              </div>
            )}
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
                <Shield className="h-8 w-8 mx-auto mb-2 text-accent opacity-50" aria-hidden="true" />
                <p className="font-medium">All clear — no flagged deliveries</p>
                <p className="text-sm text-muted-foreground mt-1">Flagged trips for route deviation or tariff mismatch will appear here for review.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
