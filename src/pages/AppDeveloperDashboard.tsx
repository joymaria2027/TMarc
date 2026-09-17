import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code2, Package, CheckCircle2, DollarSign, Users, Building2, TrendingUp, ShieldCheck } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import WalletWidget from '@/components/WalletWidget';

export default function AppDeveloperDashboard() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [delRes, restRes, riderRes, alertRes] = await Promise.all([
      supabase.from('deliveries').select('*'),
      supabase.from('merchants').select('id, name, is_active'),
      supabase.from('riders').select('id, is_online, is_active'),
      supabase.from('delivery_alerts').select('*').eq('is_resolved', false),
    ]);
    setDeliveries(delRes.data || []);
    setMerchants(restRes.data || []);
    setRiders(riderRes.data || []);
    setAlerts(alertRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('ad-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const delivered = deliveries.filter(d => d.status === 'delivered');
  const totalRevenue = delivered.reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0);
  const active = deliveries.filter(d => ['dispatched', 'in_transit', 'picked_up'].includes(d.status));

  // Daily data
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const day = format(date, 'EEE');
    const dayDels = deliveries.filter(d => d.created_at && format(new Date(d.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
    return {
      day,
      deliveries: dayDels.length,
      completed: dayDels.filter(d => d.status === 'delivered').length,
      revenue: dayDels.filter(d => d.status === 'delivered').reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0),
    };
  });

  const statCards = [
    { label: 'Platform Revenue', value: `D${totalRevenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Total Deliveries', value: deliveries.length, icon: <Package className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Completed', value: delivered.length, icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Active Now', value: active.length, icon: <TrendingUp className="h-5 w-5" />, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Merchants', value: `${merchants.filter(r => r.is_active).length}/${merchants.length}`, icon: <Building2 className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Open Alerts', value: alerts.length, icon: <ShieldCheck className="h-5 w-5" />, color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="h-6 w-6" /> Developer Dashboard</h1>
        <p className="text-muted-foreground">Platform health, metrics & Platform revenue</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`${s.bg} ${s.color} p-2 rounded-lg w-fit mb-2`}>{s.icon}</div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />Delivery Volume (7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="deliveries" fill="hsl(220, 70%, 50%)" radius={[4, 4, 0, 0]} name="Total" />
                <Bar dataKey="completed" fill="hsl(145, 60%, 42%)" radius={[4, 4, 0, 0]} name="Completed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <WalletWidget />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-accent" />Revenue Trend (7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [`D${v.toLocaleString()}`, 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(145, 60%, 42%)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* System health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Active Riders</p>
          <p className="text-xl font-bold text-accent">{riders.filter(r => r.is_online).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Active Merchants</p>
          <p className="text-xl font-bold text-primary">{merchants.filter(r => r.is_active).length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Unresolved Alerts</p>
          <p className="text-xl font-bold text-destructive">{alerts.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">Completion Rate</p>
          <p className="text-xl font-bold text-accent">{deliveries.length > 0 ? Math.round(delivered.length / deliveries.length * 100) : 0}%</p>
        </CardContent></Card>
      </div>
    </div>
  );
}
