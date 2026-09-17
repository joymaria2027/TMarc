import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Package, CheckCircle2, DollarSign, Users, TrendingUp, PieChart as PieChartIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import WalletWidget from '@/components/WalletWidget';

const PIE_COLORS = ['hsl(220, 70%, 50%)', 'hsl(145, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(200, 80%, 50%)'];

export default function BusinessOwnerDashboard() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [delRes, restRes, riderRes] = await Promise.all([
      supabase.from('deliveries').select('*'),
      supabase.from('merchants').select('id, name'),
      supabase.from('riders').select('id, is_online'),
    ]);
    setDeliveries(delRes.data || []);
    setMerchants(restRes.data || []);
    setRiders(riderRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('bo-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const delivered = deliveries.filter(d => d.status === 'delivered');
  const totalRevenue = delivered.reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0);
  const active = deliveries.filter(d => ['dispatched', 'in_transit', 'picked_up'].includes(d.status));

  // Revenue by merchant
  const restRevenue = merchants.map(r => {
    const rev = delivered.filter(d => d.merchant_id === r.id).reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0);
    return { name: r.name, value: rev };
  }).filter(r => r.value > 0).sort((a, b) => b.value - a.value);

  // Daily revenue trend
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const day = format(date, 'EEE');
    const dayDels = delivered.filter(d => d.delivered_at && format(new Date(d.delivered_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
    return {
      day,
      revenue: dayDels.reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0),
      deliveries: dayDels.length,
    };
  });

  const statCards = [
    { label: 'Total Revenue', value: `D${totalRevenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Total Deliveries', value: deliveries.length, icon: <Package className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Completed', value: delivered.length, icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Active Now', value: active.length, icon: <TrendingUp className="h-5 w-5" />, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Merchants', value: merchants.length, icon: <Building2 className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Riders', value: `${riders.filter(r => r.is_online).length}/${riders.length}`, icon: <Users className="h-5 w-5" />, color: 'text-info', bg: 'bg-info/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Business Overview</h1>
        <p className="text-muted-foreground">High-level performance across all operations</p>
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
              <TrendingUp className="h-4 w-4 text-primary" />Revenue Trend (7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
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

        <WalletWidget />
      </div>

      {/* Revenue by merchant */}
      {restRevenue.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />Revenue by Merchant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={restRevenue} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {restRevenue.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `D${v.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-sm">
                {restRevenue.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span>{r.name}</span>
                    <span className="text-muted-foreground">D{r.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
