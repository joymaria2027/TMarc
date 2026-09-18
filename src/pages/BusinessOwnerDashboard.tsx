import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, CHART_COLORS } from '@/lib/finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Package, CheckCircle2, DollarSign, Users, TrendingUp, PieChart as PieChartIcon } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import WalletWidget from '@/components/WalletWidget';

const PIE_COLORS = CHART_COLORS;

export default function BusinessOwnerDashboard() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Debounced realtime reload — bursts of events trigger one fetch, not one per event.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load(); }, 400);
  };

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); supabase.removeChannel(ch); };
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Business Overview</h1>
        <p className="text-muted-foreground">High-level performance across all operations</p>
      </div>

      {/* Operational strip (replaces hero-metric stat tiles banned by PRODUCT.md) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totalRevenue)}</strong>&nbsp;delivered revenue</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-warning" aria-hidden="true" /><strong className="tabular-nums">{active.length}</strong>&nbsp;active now</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{delivered.length}</strong>&nbsp;completed of {deliveries.length}</span>
          <span className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-primary" aria-hidden="true" /><strong className="tabular-nums">{merchants.length}</strong>&nbsp;stores</span>
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-info" aria-hidden="true" /><strong className="tabular-nums">{riders.filter(r => r.is_online).length}/{riders.length}</strong>&nbsp;riders online</span>
        </CardContent>
      </Card>

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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
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
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 text-sm">
                {restRevenue.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span>{r.name}</span>
                    <span className="text-muted-foreground tabular-nums">{formatMoney(r.value)}</span>
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
