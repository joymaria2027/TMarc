import { useState, useEffect } from 'react';
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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import WalletWidget from '@/components/WalletWidget';
import StoreQrDialog from '@/components/StoreQrDialog';
import { QrCode } from 'lucide-react';

export default function MerchantManagerDashboard() {
  const { user } = useAuth();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchant_tariffs' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Tariff dialog state
  const [tariffOpen, setTariffOpen] = useState(false);
  const [tariffMerchant, setTariffMerchant] = useState<any>(null);
  const [tariffForm, setTariffForm] = useState({ location_name: '', tariff_amount: '' });
  const [qrMerchant, setQrMerchant] = useState<any>(null);

  // Delivery dialog state
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliveryMerchant, setDeliveryMerchant] = useState<any>(null);
  const [deliveryForm, setDeliveryForm] = useState({ pickup_address: '', dropoff_address: '', order_reference: '', rider_id: '', tariff_id: '', customer_name: '', customer_phone: '' });

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

  const createDelivery = async () => {
    if (!deliveryMerchant) return;
    if (!deliveryForm.rider_id) { toast.error('Please assign a rider'); return; }
    const customerName = deliveryForm.customer_name.trim();
    const customerPhone = deliveryForm.customer_phone.trim();
    if (!customerName) { toast.error('Customer name is required'); return; }
    if (!/^[+\d][\d\s\-]{6,19}$/.test(customerPhone)) { toast.error('Enter a valid customer phone number'); return; }
    const selectedTariff = tariffs.find(t => t.id === deliveryForm.tariff_id);
    const { error } = await supabase.from('deliveries').insert({
      merchant_id: deliveryMerchant.id,
      pickup_address: deliveryForm.pickup_address || deliveryMerchant.address,
      dropoff_address: deliveryForm.dropoff_address,
      order_reference: deliveryForm.order_reference || null,
      rider_id: deliveryForm.rider_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      estimated_tariff: selectedTariff ? selectedTariff.tariff_amount : null,
      pickup_latitude: deliveryMerchant.latitude,
      pickup_longitude: deliveryMerchant.longitude,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Delivery created & dispatched');
    setDeliveryOpen(false);
    setDeliveryForm({ pickup_address: '', dropoff_address: '', order_reference: '', rider_id: '', tariff_id: '', customer_name: '', customer_phone: '' });
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

  const statCards = [
    { label: 'My Merchants', value: myMerchants.length, icon: <Building2 className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Total Deliveries', value: myDeliveries.length, icon: <Package className="h-5 w-5" />, color: 'text-info', bg: 'bg-info/10' },
    { label: 'Active Now', value: active.length, icon: <Clock className="h-5 w-5" />, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Completed', value: delivered.length, icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Revenue', value: `D${totalRevenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Settlements', value: `${approvedCount}/${delivered.length}`, icon: <TrendingUp className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Operator</p>
        <h1 className="font-display text-4xl tracking-tight">Merchant dashboard.</h1>
        <p className="text-muted-foreground">A quick read on the day's deliveries, revenue and settlements.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`${s.bg} ${s.color} p-2 rounded-md w-fit mb-3`}>{s.icon}</div>
              <p className="font-display text-3xl tabular-nums leading-none">{s.value}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                    <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => { setDeliveryMerchant(r); setDeliveryOpen(true); }}>
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
                  <p className="font-semibold">D {Number(t.tariff_amount).toFixed(2)}</p>
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
            <div className="space-y-2"><Label>Location Name</Label><Input value={tariffForm.location_name} onChange={e => setTariffForm(p => ({ ...p, location_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Tariff Amount (D)</Label><Input type="number" step="any" value={tariffForm.tariff_amount} onChange={e => setTariffForm(p => ({ ...p, tariff_amount: e.target.value }))} /></div>
            <Button onClick={addTariff} className="w-full">Add Tariff</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Delivery Dialog */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Delivery – {deliveryMerchant?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Order Reference (optional)</Label><Input value={deliveryForm.order_reference} onChange={e => setDeliveryForm(p => ({ ...p, order_reference: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Customer Name *</Label><Input required value={deliveryForm.customer_name} onChange={e => setDeliveryForm(p => ({ ...p, customer_name: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Customer Phone *</Label><Input required type="tel" inputMode="tel" maxLength={20} placeholder="+220…" value={deliveryForm.customer_phone} onChange={e => setDeliveryForm(p => ({ ...p, customer_phone: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Pickup Address</Label><Input placeholder={deliveryMerchant?.address || ''} value={deliveryForm.pickup_address} onChange={e => setDeliveryForm(p => ({ ...p, pickup_address: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Dropoff Address</Label><Input value={deliveryForm.dropoff_address} onChange={e => setDeliveryForm(p => ({ ...p, dropoff_address: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Tariff (optional)</Label>
              <Select value={deliveryForm.tariff_id} onValueChange={v => setDeliveryForm(p => ({ ...p, tariff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select tariff" /></SelectTrigger>
                <SelectContent>
                  {tariffs.filter(t => t.merchant_id === deliveryMerchant?.id).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.location_name} – D{t.tariff_amount}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign Rider</Label>
              <Select value={deliveryForm.rider_id} onValueChange={v => setDeliveryForm(p => ({ ...p, rider_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select rider" /></SelectTrigger>
                <SelectContent>
                  {riders.map(r => {
                    const p = profiles.find(pr => pr.user_id === r.user_id);
                    return <SelectItem key={r.id} value={r.id}>{p?.full_name || r.id.slice(0, 8)}{r.is_online ? ' • online' : ''}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createDelivery} className="w-full">Create & Dispatch</Button>
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
