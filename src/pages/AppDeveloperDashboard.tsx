import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, CHART_COLORS } from '@/lib/finance';
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
  // Debounced realtime reload — bursts of events trigger one fetch, not one per event.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load(); }, 400);
  };

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); supabase.removeChannel(ch); };
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

  const completionRate = deliveries.length > 0 ? Math.round(delivered.length / deliveries.length * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="h-6 w-6" /> Developer Dashboard</h1>
        <p className="text-muted-foreground">Platform health, metrics & Platform revenue</p>
      </div>

      {/* Operational strip + platform-data links (replaces the 10 hero-metric tiles) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totalRevenue)}</strong>&nbsp;platform revenue</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-warning" aria-hidden="true" /><strong className="tabular-nums">{active.length}</strong>&nbsp;active now</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{completionRate}%</strong>&nbsp;completion</span>
          <Link to="/rls-verification" className="flex items-center gap-1.5 hover:underline underline-offset-4"><ShieldCheck className="h-4 w-4 text-destructive" aria-hidden="true" /><strong className="tabular-nums">{alerts.length}</strong>&nbsp;unresolved alerts</Link>
        </CardContent>
      </Card>

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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="deliveries" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Total" />
                <Bar dataKey="completed" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} name="Completed" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [formatMoney(v), 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* System health as links (lane-10: dev dashboard should link into platform-data pages) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{riders.filter(r => r.is_online).length}</strong>&nbsp;active riders</span>
          <Link to="/merchants" className="flex items-center gap-1.5 hover:underline underline-offset-4"><Building2 className="h-4 w-4 text-primary" aria-hidden="true" /><strong className="tabular-nums">{merchants.filter(r => r.is_active).length}</strong>&nbsp;active stores</Link>
          <Link to="/webhook-events" className="flex items-center gap-1.5 hover:underline underline-offset-4"><Package className="h-4 w-4 text-info" aria-hidden="true" />Webhook events</Link>
        </CardContent>
      </Card>
    </div>
  );
}
