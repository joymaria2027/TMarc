import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck, Clock, MapPin, Fuel, CreditCard } from 'lucide-react';
import { formatMoney } from '@/lib/finance';

const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'));

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', wave: 'Wave', qmoney: 'QMoney', afrimoney: 'Afrimoney',
  aps_wallet: 'APS Wallet', bank_transfer: 'Bank Transfer',
};

const DELIVERY_CAP = 1000;

export default function AnalyticsPage() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      const [dRes, rRes, pRes, restRes] = await Promise.all([
        supabase.from('deliveries').select('*').order('created_at', { ascending: false }).limit(DELIVERY_CAP),
        supabase.from('riders').select('*'),
        supabase.from('profiles').select('user_id, full_name'),
        supabase.from('merchants').select('id, name'),
      ]);
      const profileMap = Object.fromEntries(((pRes.data || []) as any[]).map(p => [p.user_id, p]));
      const dData = (dRes.data || []) as any[];
      setDeliveries(dData);
      setCapped(dData.length >= DELIVERY_CAP);
      setRiders(((rRes.data || []) as any[]).map(r => ({ ...r, profiles: profileMap[r.user_id] || null })));
      setMerchants((restRes.data || []) as any[]);
      setLoading(false);
    };
    const schedule = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => load(), 600);
    };
    load();
    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => schedule())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => schedule())
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => paymentFilter === 'all'
    ? deliveries
    : paymentFilter === 'none'
      ? deliveries.filter(d => !d.payment_method)
      : deliveries.filter(d => d.payment_method === paymentFilter), [deliveries, paymentFilter]);

  const completed = useMemo(() => filtered.filter(d => d.status === 'delivered'), [filtered]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach(d => { counts[d.status] = (counts[d.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const paymentData = useMemo(() => {
    const counts: Record<string, number> = {};
    deliveries.filter(d => d.status === 'delivered').forEach(d => {
      const method = d.payment_method || 'Not set';
      counts[method] = (counts[method] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name: PAYMENT_LABELS[name] || name, value }))
      .sort((a, b) => b.value - a.value);
  }, [deliveries]);

  const paymentRevenueData = useMemo(() => {
    const rev: Record<string, number> = {};
    deliveries.filter(d => d.status === 'delivered').forEach(d => {
      const method = d.payment_method || 'Not set';
      rev[method] = (rev[method] || 0) + Number(d.actual_tariff ?? d.estimated_tariff ?? 0);
    });
    return Object.entries(rev)
      .map(([name, value]) => ({ name: PAYMENT_LABELS[name] || name, revenue: Math.round(value) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [deliveries]);

  const riderPerf = useMemo(() => riders.map(r => {
    const rDeliveries = completed.filter(d => d.rider_id === r.id);
    const totalDist = rDeliveries.reduce((acc: number, d: any) => acc + (d.actual_distance_km || 0), 0);
    const avgTime = rDeliveries.length > 0
      ? rDeliveries.reduce((acc: number, d: any) => {
          if (d.picked_up_at && d.delivered_at) {
            return acc + (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000;
          }
          return acc;
        }, 0) / rDeliveries.length
      : 0;
    return {
      name: (r.profiles as any)?.full_name || 'Unknown',
      deliveries: rDeliveries.length,
      distance: Math.round(totalDist * 10) / 10,
      avgTime: Math.round(avgTime),
      efficiency: rDeliveries.length > 0 ? Math.round((rDeliveries.filter((d: any) => !d.is_flagged && !d.route_deviation_detected).length / rDeliveries.length) * 100) : 0,
    };
  }).filter(r => r.deliveries > 0), [riders, completed]);

  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    completed.forEach(d => {
      const day = d.delivered_at?.slice(0, 10) || '';
      if (day) map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map).sort().slice(-14).map(([date, count]) => ({ date: date.slice(5), count }));
  }, [completed]);

  const merchantData = useMemo(() => {
    const restMap = new Map<string, { name: string; deliveries: number; revenue: number; avgTime: number; totalTime: number; timeCount: number }>();
    completed.forEach(d => {
      const rest = merchants.find(r => r.id === d.merchant_id);
      const name = rest?.name || 'Unknown';
      if (!restMap.has(d.merchant_id)) restMap.set(d.merchant_id, { name, deliveries: 0, revenue: 0, avgTime: 0, totalTime: 0, timeCount: 0 });
      const entry = restMap.get(d.merchant_id)!;
      entry.deliveries++;
      entry.revenue += Number(d.actual_tariff ?? d.estimated_tariff ?? 0);
      if (d.picked_up_at && d.delivered_at) {
        entry.totalTime += (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000;
        entry.timeCount++;
      }
    });
    return Array.from(restMap.values())
      .map(r => ({ name: r.name, deliveries: r.deliveries, revenue: Math.round(r.revenue), avgTime: r.timeCount > 0 ? Math.round(r.totalTime / r.timeCount) : 0 }))
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 20);
  }, [completed, merchants]);

  const merchantTruncated = useMemo(() => {
    const ids = new Set(completed.map(d => d.merchant_id));
    return ids.size > 20;
  }, [completed]);

  const totals = useMemo(() => {
    const totalDistance = Math.round(completed.reduce((a: number, d: any) => a + (d.actual_distance_km || 0), 0) * 10) / 10;
    const avgDeliveryTime = completed.length > 0
      ? Math.round(completed.reduce((acc: number, d: any) => {
          if (d.picked_up_at && d.delivered_at) return acc + (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000;
          return acc;
        }, 0) / completed.length)
      : 0;
    const totalRevenue = Math.round(completed.reduce((a: number, d: any) => a + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0));
    return { totalDistance, avgDeliveryTime, totalRevenue };
  }, [completed]);

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading analytics">
      <div className="shimmer h-16 rounded-md" aria-hidden="true" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4" aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="shimmer h-24 rounded-md" />)}
      </div>
      <span className="sr-only">Loading analytics…</span>
    </div>
  );

  return (
    <div className="space-y-6" aria-busy={loading}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Performance metrics and delivery insights</p>
          {capped && <p className="text-xs text-muted-foreground mt-1">Showing latest {DELIVERY_CAP} deliveries. Narrow the payment filter for detail.</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="analytics-payment">Payment method</Label>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger id="analytics-payment" className="w-44 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="wave">Wave</SelectItem>
                <SelectItem value="qmoney">QMoney</SelectItem>
                <SelectItem value="afrimoney">Afrimoney</SelectItem>
                <SelectItem value="aps_wallet">APS Wallet</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="none">Not Set</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4"><Truck className="h-5 w-5 text-primary mb-2" aria-hidden="true" /><p className="text-2xl font-bold tabular-nums text-right">{completed.length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="p-4"><Clock className="h-5 w-5 text-primary mb-2" aria-hidden="true" /><p className="text-2xl font-bold tabular-nums text-right">{totals.avgDeliveryTime}m</p><p className="text-xs text-muted-foreground">Avg Delivery Time</p></CardContent></Card>
        <Card><CardContent className="p-4"><MapPin className="h-5 w-5 text-primary mb-2" aria-hidden="true" /><p className="text-2xl font-bold tabular-nums text-right">{totals.totalDistance}km</p><p className="text-xs text-muted-foreground">Total Distance</p></CardContent></Card>
        <Card><CardContent className="p-4"><Fuel className="h-5 w-5 text-primary mb-2" aria-hidden="true" /><p className="text-2xl font-bold tabular-nums text-right">{riders.length}</p><p className="text-xs text-muted-foreground">Active Riders</p></CardContent></Card>
        <Card><CardContent className="p-4"><CreditCard className="h-5 w-5 text-primary mb-2" aria-hidden="true" /><p className="text-2xl font-bold tabular-nums text-right">{formatMoney(totals.totalRevenue)}</p><p className="text-xs text-muted-foreground">Total Revenue</p></CardContent></Card>
      </div>

      <Suspense fallback={<div className="shimmer h-64 rounded-md" role="status" aria-label="Loading charts"><span className="sr-only">Loading charts…</span></div>}>
        <AnalyticsCharts
          dailyData={dailyData}
          statusData={statusData}
          paymentData={paymentData}
          paymentRevenueData={paymentRevenueData}
          merchantData={merchantData}
          riderPerf={riderPerf}
          onClearFilter={() => setPaymentFilter('all')}
          merchantTruncated={merchantTruncated}
        />
      </Suspense>
    </div>
  );
}
