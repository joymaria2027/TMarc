import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, Package, CheckCircle2, Clock, DollarSign, Users, TrendingUp, Plus, DollarSign as DollarIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { formatMoney } from '@/lib/finance';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import WalletWidget from '@/components/WalletWidget';
import StoreQrDialog from '@/components/StoreQrDialog';
import { QrCode } from 'lucide-react';

export default function MerchantManagerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Debounced realtime reload — bursts of events trigger one fetch, not one per event.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load(); }, 400);
  };

  const load = async () => {
    const [restRes, delRes, riderRes, profRes, tariffRes] = await Promise.all([
      supabase.from('merchants').select('*'),
      supabase.from('deliveries').select('*').order('created_at', { ascending: false }),
      supabase.from('riders').select('id, user_id, is_online'),
      supabase.from('profiles').select('user_id, full_name'),
      supabase.from('merchant_tariffs').select('*'),
    ]);
    setMerchants(restRes.data || []);
    setDeliveries(delRes.data || []);
    setRiders(riderRes.data || []);
    setProfiles(profRes.data || []);
    setTariffs(tariffRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('rm-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_tariffs' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); supabase.removeChannel(ch); };
  }, []);

  // Tariff dialog state
  const [tariffOpen, setTariffOpen] = useState(false);
  const [tariffMerchant, setTariffMerchant] = useState<any>(null);
  const [tariffForm, setTariffForm] = useState({ location_name: '', tariff_amount: '' });
  const [qrMerchant, setQrMerchant] = useState<any>(null);

  const addTariff = async () => {
    if (!tariffMerchant || !user) return;
    const { error } = await supabase.from('merchant_tariffs').insert({
      merchant_id: tariffMerchant.id,
      location_name: tariffForm.location_name,
      tariff_amount: parseFloat(tariffForm.tariff_amount),
      set_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Tariff added');
    setTariffOpen(false);
    setTariffForm({ location_name: '', tariff_amount: '' });
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Scope to merchants this manager is assigned to
  const myMerchants = merchants.filter(r => r.manager_user_id === user?.id);
  const myRestIds = myMerchants.map(r => r.id);
  const myDeliveries = deliveries.filter(d => myRestIds.includes(d.merchant_id));
  const delivered = myDeliveries.filter(d => d.status === 'delivered');
  const active = myDeliveries.filter(d => ['dispatched', 'in_transit', 'picked_up'].includes(d.status));
  const totalRevenue = delivered.reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0);
  const approvedCount = delivered.filter(d => d.settlement_approved).length;

  // Daily chart
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const day = format(date, 'EEE');
    const dayDels = myDeliveries.filter(d => d.created_at && format(new Date(d.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
    return { day, deliveries: dayDels.length, completed: dayDels.filter(d => d.status === 'delivered').length };
  });

  const getRiderName = (riderId: string) => {
    const rider = riders.find(r => r.id === riderId);
    if (!rider) return 'Unknown';
    const profile = profiles.find(p => p.user_id === rider.user_id);
    return profile?.full_name || 'Unknown';
  };

  const myTariffs = tariffs.filter(t => myRestIds.includes(t.merchant_id));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Merchant dashboard</h1>
        <p className="text-muted-foreground">A quick read on the day's deliveries, revenue and settlements.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-warning" aria-hidden="true" /><strong className="tabular-nums">{active.length}</strong>&nbsp;active now</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{delivered.length}</strong>&nbsp;completed</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" /><strong className="tabular-nums">{approvedCount}/{delivered.length}</strong>&nbsp;settled</span>
          <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totalRevenue)}</strong>&nbsp;revenue</span>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />Deliveries (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="deliveries" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total" />
                <Bar dataKey="completed" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <WalletWidget />
      </div>

      {/* My Merchants – quick actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />My Merchants</CardTitle>
        </CardHeader>
        <CardContent>
          {myMerchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">You are not assigned to any merchant yet. Contact your admin.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myMerchants.map(r => (
                <div key={r.id} className="border rounded-lg p-3 space-y-2">
                  <div>
                    <p className="font-medium text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.address}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => navigate(`/deliveries/new?merchant=${r.id}`)}>
                      <Plus className="h-3 w-3" />Delivery
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setTariffMerchant(r); setTariffOpen(true); }}>
                      <DollarIcon className="h-3 w-3" />Tariff
                    </Button>
                    {(r as any).approval_status === 'approved' ? (
                      <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => setQrMerchant(r)}>
                        <QrCode className="h-3 w-3" />QR
                      </Button>
                    ) : (
                      <Badge variant="outline" className="flex-1 justify-center">Pending review</Badge>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tariffs summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">My Tariffs</CardTitle>
        </CardHeader>
        <CardContent>
          {myTariffs.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {myTariffs.map(t => (
                <div key={t.id} className="bg-muted rounded p-2 text-sm">
                  <p className="text-muted-foreground text-xs">{t.location_name}</p>
                  <p className="font-semibold">{formatMoney(Number(t.tariff_amount))}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No tariffs set yet</p>}
        </CardContent>
      </Card>

      {/* Recent deliveries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {myDeliveries.slice(0, 10).map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.order_reference || d.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.pickup_address} → {d.dropoff_address}</p>
                  {d.rider_id && <p className="text-xs text-muted-foreground">Rider: {getRiderName(d.rider_id)}</p>}
                </div>
                <Badge variant="secondary" className="capitalize shrink-0">{d.status.replace('_', ' ')}</Badge>
              </div>
            ))}
            {myDeliveries.length === 0 && <p className="text-center text-muted-foreground py-4">No deliveries yet</p>}
          </div>
        </CardContent>
      </Card>

      {/* Set Tariff Dialog */}
      <Dialog open={tariffOpen} onOpenChange={setTariffOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set Tariff – {tariffMerchant?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="tariff-location">Location Name</Label><Input id="tariff-location" value={tariffForm.location_name} onChange={e => setTariffForm(p => ({ ...p, location_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="tariff-amount">Tariff Amount (D)</Label><Input id="tariff-amount" type="number" step="any" value={tariffForm.tariff_amount} onChange={e => setTariffForm(p => ({ ...p, tariff_amount: e.target.value }))} /></div>
            <Button onClick={addTariff} className="w-full">Add Tariff</Button>
          </div>
        </DialogContent>
      </Dialog>
      {qrMerchant && (
        <StoreQrDialog
          open={!!qrMerchant}
          onOpenChange={v => { if (!v) setQrMerchant(null); }}
          merchantId={qrMerchant.id}
          merchantName={qrMerchant.name}
        />
      )}
    </div>
  );
}
