import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PieChart, Plus, Percent, Trash2, Pencil, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { validateSharing } from '@/lib/finance';

export default function RevenueSharingPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('admin') || hasRole('business_owner');
  const isRider = hasRole('rider');
  const [shares, setShares] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    merchant_id: '',
    rider_percentage: '50',
    merchant_percentage: '20',
    platform_percentage: '15',
    ucs_rides_percentage: '15',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 500);
  };

  const load = async () => {
    const [sharesRes, restRes] = await Promise.all([
      supabase.from('revenue_sharing').select('*').order('created_at', { ascending: false }),
      supabase.from('merchants').select('id, name'),
    ]);
    setShares(sharesRes.data || []);
    setMerchants(restRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('revenue-sharing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => scheduleReload())
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const createShare = async () => {
    const rp = parseFloat(form.rider_percentage);
    const restp = parseFloat(form.merchant_percentage);
    const pp = parseFloat(form.platform_percentage);
    const ucs = parseFloat(form.ucs_rides_percentage);
    const err = validateSharing({ merchant_id: form.merchant_id, r: rp, m: restp, p: pp, u: ucs });
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);

    // Check if merchant already has a ratio
    const existing = shares.find(s => s.merchant_id === form.merchant_id);
    if (existing) {
      const { error } = await supabase.from('revenue_sharing')
        .update({
          rider_percentage: rp,
          merchant_percentage: restp,
          platform_percentage: pp,
          ucs_rides_percentage: ucs,
        })
        .eq('id', existing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Revenue sharing updated');
    } else {
      // We need a delivery_id since it's required – use a placeholder approach
      // For merchant-level ratios, we insert with the merchant_id
      const { data: deliveryData } = await supabase
        .from('deliveries')
        .select('id')
        .eq('merchant_id', form.merchant_id)
        .limit(1);

      const deliveryId = deliveryData?.[0]?.id;
      if (!deliveryId) {
        toast.error('No deliveries found for this merchant. Create a delivery first.');
        return;
      }

      const { error } = await supabase.from('revenue_sharing').insert({
        delivery_id: deliveryId,
        merchant_id: form.merchant_id,
        rider_id: null, // Rule applies to whichever rider performs the delivery
        rider_percentage: rp,
        merchant_percentage: restp,
        platform_percentage: pp,
        ucs_rides_percentage: ucs,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Revenue sharing set');
    }

    setOpen(false);
    setForm({ merchant_id: '', rider_percentage: '50', merchant_percentage: '20', platform_percentage: '15', ucs_rides_percentage: '15' });
    load();
  };

  const getMerchantName = (id: string | null) => {
    if (!id) return '–';
    return merchants.find(r => r.id === id)?.name || id.slice(0, 8);
  };

  const editShare = (s: any) => {
    setForm({
      merchant_id: s.merchant_id || '',
      rider_percentage: String(s.rider_percentage),
      merchant_percentage: String(s.merchant_percentage),
      platform_percentage: String(s.platform_percentage),
      ucs_rides_percentage: String(s.ucs_rides_percentage),
    });
    setFormError(null);
    setOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('revenue_sharing').delete().eq('id', deleteId);
    if (error) { toast.error(error.message); return; }
    toast.success('Revenue sharing deleted');
    setDeleteId(null);
    load();
  };

  const visibleShares = useMemo(() => {
    if (isRider && !canManage) {
      const byRest = new Map<string, any>();
      shares.forEach((s: any) => {
        if (!s.merchant_id) return;
        const existing = byRest.get(s.merchant_id);
        if (!existing || (s.rider_id != null && existing.rider_id == null)) {
          byRest.set(s.merchant_id, s);
        }
      });
      return Array.from(byRest.values());
    }
    return shares;
  }, [shares, isRider, canManage]);

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading revenue sharing">
      {[0, 1, 2].map(i => (
        <div key={i} className="shimmer h-20 rounded-md" aria-hidden="true" />
      ))}
      <span className="sr-only">Loading revenue sharing…</span>
    </div>
  );

  return (
    <div className="space-y-6" aria-busy={false}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revenue Sharing</h1>
          <p className="text-muted-foreground">
            {isRider && !canManage
              ? 'Your share of delivery revenue per merchant'
              : 'Set revenue split ratios per merchant'}
          </p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm({ merchant_id: '', rider_percentage: '50', merchant_percentage: '20', platform_percentage: '15', ucs_rides_percentage: '15' }); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Set Sharing</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Set Revenue Sharing</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rs-merchant">Merchant</Label>
                  <Select value={form.merchant_id} onValueChange={v => { setForm(p => ({ ...p, merchant_id: v })); setFormError(null); }}>
                    <SelectTrigger id="rs-merchant" aria-describedby={formError ? 'rs-form-error' : undefined}><SelectValue placeholder="Select merchant" /></SelectTrigger>
                    <SelectContent>
                      {merchants.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rs-rider">Rider %</Label>
                    <Input id="rs-rider" type="number" min="0" max="100" step="0.01" value={form.rider_percentage} onChange={e => setForm(p => ({ ...p, rider_percentage: e.target.value }))} aria-invalid={!!formError} aria-describedby={formError ? 'rs-form-error' : undefined} className="tabular-nums" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-merchant-pct">Merchant %</Label>
                    <Input id="rs-merchant-pct" type="number" min="0" max="100" step="0.01" value={form.merchant_percentage} onChange={e => setForm(p => ({ ...p, merchant_percentage: e.target.value }))} aria-invalid={!!formError} aria-describedby={formError ? 'rs-form-error' : undefined} className="tabular-nums" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-platform">Platform %</Label>
                    <Input id="rs-platform" type="number" min="0" max="100" step="0.01" value={form.platform_percentage} onChange={e => setForm(p => ({ ...p, platform_percentage: e.target.value }))} aria-invalid={!!formError} aria-describedby={formError ? 'rs-form-error' : undefined} className="tabular-nums" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rs-ucs">UCS Rides %</Label>
                    <Input id="rs-ucs" type="number" min="0" max="100" step="0.01" value={form.ucs_rides_percentage} onChange={e => setForm(p => ({ ...p, ucs_rides_percentage: e.target.value }))} aria-invalid={!!formError} aria-describedby={formError ? 'rs-form-error' : undefined} className="tabular-nums" />
                  </div>
                </div>
                {formError && <p id="rs-form-error" role="alert" className="text-sm text-destructive">{formError}</p>}
                <Button onClick={createShare} className="w-full">Save Sharing Ratio</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table aria-label="Revenue sharing ratios">
          <caption className="sr-only">Per-merchant revenue split ratios with live total check and edit actions</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Rider %</TableHead>
              <TableHead className="text-right">Merchant %</TableHead>
              <TableHead className="text-right">Platform %</TableHead>
              <TableHead className="text-right">UCS %</TableHead>
              <TableHead>Total check</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleShares.map((s: any) => {
              const total = Number(s.rider_percentage) + Number(s.merchant_percentage) + Number(s.platform_percentage) + Number(s.ucs_rides_percentage);
              const balanced = Math.abs(total - 100) < 0.01;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-medium">{getMerchantName(s.merchant_id)}</span>
                    {isRider && !canManage && (
                      <span className="block text-xs text-muted-foreground">
                        {s.rider_id ? 'Personal rate assigned to you' : 'Default rate for this merchant'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      <Percent className="h-3 w-3" aria-hidden="true" />
                      {isRider && !canManage ? `Your share: ${s.rider_percentage}%` : `${s.rider_percentage}%`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(!isRider || canManage) ? (
                      <span className="inline-flex items-center justify-end gap-1"><Percent className="h-3 w-3" aria-hidden="true" />{s.merchant_percentage}%</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(!isRider || canManage) ? (
                      <span className="inline-flex items-center justify-end gap-1"><Percent className="h-3 w-3" aria-hidden="true" />{s.platform_percentage}%</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(!isRider || canManage) ? (
                      <span className="inline-flex items-center justify-end gap-1"><Percent className="h-3 w-3" aria-hidden="true" />{s.ucs_rides_percentage}%</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {balanced ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Σ 100%</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />Σ {total}%</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="min-h-[44px] gap-1 px-2" onClick={() => editShare(s)} aria-label={`Edit sharing for ${getMerchantName(s.merchant_id)}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                        </Button>
                        <Button size="icon" variant="ghost" className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive" onClick={() => setDeleteId(s.id)} aria-label={`Delete sharing for ${getMerchantName(s.merchant_id)}`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {visibleShares.length > 0 && (
        <p className="text-xs text-muted-foreground" role="status">{visibleShares.length} {visibleShares.length === 1 ? 'ratio' : 'ratios'} shown</p>
      )}
        {shares.length === 0 && (
          <div className="text-center py-10">
            <PieChart className="h-10 w-10 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p className="font-medium">No revenue sharing ratios yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {isRider && !canManage
                ? 'No rate is set for the merchants you deliver for. Your rider share will appear here once an admin sets it.'
                : 'Set a per-merchant split so settlements can auto-calculate rider, merchant, platform and UCS shares.'}
            </p>
            {canManage && (
              <Button className="mt-4" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" aria-hidden="true" />Set your first sharing ratio</Button>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete revenue sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this revenue split rule. Future deliveries for this merchant won't credit any wallets until a new rule is set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
