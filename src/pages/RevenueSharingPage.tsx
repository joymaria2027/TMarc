import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PieChart, Plus, Percent, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const createShare = async () => {
    if (!form.merchant_id) {
      toast.error('Please select a merchant');
      return;
    }
    const rp = parseFloat(form.rider_percentage);
    const restp = parseFloat(form.merchant_percentage);
    const pp = parseFloat(form.platform_percentage);
    const ucs = parseFloat(form.ucs_rides_percentage);
    if (Math.abs(rp + restp + pp + ucs - 100) > 0.01) {
      toast.error('Percentages must add up to 100%');
      return;
    }

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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
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
                  <Label>Merchant</Label>
                  <Select value={form.merchant_id} onValueChange={v => setForm(p => ({ ...p, merchant_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select merchant" /></SelectTrigger>
                    <SelectContent>
                      {merchants.map(r => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Rider %</Label>
                    <Input type="number" value={form.rider_percentage} onChange={e => setForm(p => ({ ...p, rider_percentage: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Merchant %</Label>
                    <Input type="number" value={form.merchant_percentage} onChange={e => setForm(p => ({ ...p, merchant_percentage: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Platform %</Label>
                    <Input type="number" value={form.platform_percentage} onChange={e => setForm(p => ({ ...p, platform_percentage: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>UCS Rides %</Label>
                    <Input type="number" value={form.ucs_rides_percentage} onChange={e => setForm(p => ({ ...p, ucs_rides_percentage: e.target.value }))} />
                  </div>
                </div>
                <Button onClick={createShare} className="w-full">Save Sharing Ratio</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-3">
        {(() => {
          // For riders without manage rights: collapse per merchant — prefer a personal rate, otherwise show the merchant default.
          let visible = shares;
          if (isRider && !canManage) {
            const myRiderId = (shares.find((s: any) => s.rider_id) as any)?.rider_id; // RLS only returns own + null rows
            const byRest = new Map<string, any>();
            const personalRiderId = shares.find((s: any) => s.rider_id != null)?.rider_id;
            shares.forEach((s: any) => {
              if (!s.merchant_id) return;
              const existing = byRest.get(s.merchant_id);
              // Prefer rider-specific over default
              if (!existing || (s.rider_id != null && existing.rider_id == null)) {
                byRest.set(s.merchant_id, s);
              }
            });
            visible = Array.from(byRest.values());
          }
          return visible.map((s: any) => (
          <Card key={s.id} className={canManage ? 'hover:border-primary/50 transition-colors' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className={canManage ? 'cursor-pointer flex-1' : 'flex-1'} onClick={() => canManage && editShare(s)}>
                  <p className="font-medium">{getMerchantName(s.merchant_id)}</p>
                  {canManage && <p className="text-xs text-muted-foreground">Click to edit</p>}
                  {isRider && !canManage && (
                    <p className="text-xs text-muted-foreground">
                      {s.rider_id ? 'Personal rate assigned to you' : 'Default rate for this merchant'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant={isRider && !canManage ? 'default' : 'outline'}
                    className={`gap-1 ${isRider && !canManage ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    <Percent className="h-3 w-3" />
                    {isRider && !canManage ? 'Your share' : 'Rider'}: {s.rider_percentage}%
                  </Badge>
                  {(!isRider || canManage) && (
                    <>
                      <Badge variant="outline" className="gap-1"><Percent className="h-3 w-3" />Merchant: {s.merchant_percentage}%</Badge>
                      <Badge variant="outline" className="gap-1"><Percent className="h-3 w-3" />Platform: {s.platform_percentage}%</Badge>
                      <Badge variant="outline" className="gap-1 bg-primary/5"><Percent className="h-3 w-3" />UCS Rides: {s.ucs_rides_percentage}%</Badge>
                    </>
                  )}
                  {canManage && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          ));
        })()}
        {shares.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <PieChart className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>
              {isRider && !canManage
                ? 'No revenue rate set for the merchants you can deliver for yet. Ask an admin to set sharing.'
                : 'No revenue sharing ratios set yet'}
            </p>
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
