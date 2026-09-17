import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Truck, Clock, MapPin, Fuel, CreditCard } from 'lucide-react';

const COLORS = ['hsl(220, 70%, 50%)', 'hsl(145, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(200, 80%, 50%)', 'hsl(280, 60%, 50%)'];

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', wave: 'Wave', qmoney: 'QMoney', afrimoney: 'Afrimoney',
  aps_wallet: 'APS Wallet', bank_transfer: 'Bank Transfer',
};

export default function AnalyticsPage() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentFilter, setPaymentFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      const [dRes, rRes, pRes, restRes] = await Promise.all([
        supabase.from('deliveries').select('*'),
        supabase.from('riders').select('*'),
        supabase.from('profiles').select('user_id, full_name'),
        supabase.from('merchants').select('id, name'),
      ]);
      const profileMap = Object.fromEntries((pRes.data || []).map(p => [p.user_id, p]));
      setDeliveries(dRes.data || []);
      setRiders((rRes.data || []).map(r => ({ ...r, profiles: profileMap[r.user_id] || null })));
      setMerchants(restRes.data || []);
      setLoading(false);
    };
    load();
    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Apply payment filter
  const filtered = paymentFilter === 'all'
    ? deliveries
    : paymentFilter === 'none'
      ? deliveries.filter(d => !d.payment_method)
      : deliveries.filter(d => d.payment_method === paymentFilter);

  const completed = filtered.filter(d => d.status === 'delivered');

  // Status distribution
  const statusCounts: Record<string, number> = {};
  filtered.forEach(d => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // Payment method distribution (from all delivered deliveries, ignoring filter)
  const allCompleted = deliveries.filter(d => d.status === 'delivered');
  const paymentCounts: Record<string, number> = {};
  allCompleted.forEach(d => {
    const method = d.payment_method || 'Not set';
    paymentCounts[method] = (paymentCounts[method] || 0) + 1;
  });
  const paymentData = Object.entries(paymentCounts)
    .map(([name, value]) => ({ name: PAYMENT_LABELS[name] || name, value }))
    .sort((a, b) => b.value - a.value);

  // Payment method revenue breakdown
  const paymentRevenue: Record<string, number> = {};
  allCompleted.forEach(d => {
    const method = d.payment_method || 'Not set';
    const tariff = Number(d.actual_tariff ?? d.estimated_tariff ?? 0);
    paymentRevenue[method] = (paymentRevenue[method] || 0) + tariff;
  });
  const paymentRevenueData = Object.entries(paymentRevenue)
    .map(([name, value]) => ({ name: PAYMENT_LABELS[name] || name, revenue: Math.round(value) }))
    .sort((a, b) => b.revenue - a.revenue);

  // Rider performance
  const riderPerf = riders.map(r => {
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
  }).filter(r => r.deliveries > 0);

  // Daily deliveries
  const dailyMap: Record<string, number> = {};
  completed.forEach(d => {
    const day = d.delivered_at?.slice(0, 10) || '';
    if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;
  });
  const dailyData = Object.entries(dailyMap).sort().slice(-14).map(([date, count]) => ({ date: date.slice(5), count }));

  const totalDistance = Math.round(completed.reduce((a: number, d: any) => a + (d.actual_distance_km || 0), 0) * 10) / 10;
  const avgDeliveryTime = completed.length > 0
    ? Math.round(completed.reduce((acc: number, d: any) => {
        if (d.picked_up_at && d.delivered_at) return acc + (new Date(d.delivered_at).getTime() - new Date(d.picked_up_at).getTime()) / 60000;
        return acc;
      }, 0) / completed.length)
    : 0;
  const totalRevenue = Math.round(completed.reduce((a: number, d: any) => a + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Performance metrics and delivery insights</p>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4"><Truck className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-bold">{completed.length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="p-4"><Clock className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-bold">{avgDeliveryTime}m</p><p className="text-xs text-muted-foreground">Avg Delivery Time</p></CardContent></Card>
        <Card><CardContent className="p-4"><MapPin className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-bold">{totalDistance}km</p><p className="text-xs text-muted-foreground">Total Distance</p></CardContent></Card>
        <Card><CardContent className="p-4"><Fuel className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-bold">{riders.length}</p><p className="text-xs text-muted-foreground">Active Riders</p></CardContent></Card>
        <Card><CardContent className="p-4"><CreditCard className="h-5 w-5 text-primary mb-2" /><p className="text-2xl font-bold">D{totalRevenue.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Revenue</p></CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Daily Deliveries</CardTitle></CardHeader>
          <CardContent>
            {dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(220, 70%, 50%)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No data yet</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Delivery Status</CardTitle></CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No data yet</p>}
          </CardContent>
        </Card>

        {/* Payment Method Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Payment Methods (Count)</CardTitle></CardHeader>
          <CardContent>
            {paymentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No data yet</p>}
          </CardContent>
        </Card>

        {/* Payment Method Revenue */}
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Payment Method</CardTitle></CardHeader>
          <CardContent>
            {paymentRevenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={paymentRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v: number) => `D${v.toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="hsl(220, 70%, 50%)" name="Revenue (D)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No data yet</p>}
          </CardContent>
        </Card>

        {/* Merchant Breakdown */}
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Merchant Breakdown</CardTitle></CardHeader>
          <CardContent>
            {(() => {
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
              const restData = Array.from(restMap.values())
                .map(r => ({ ...r, revenue: Math.round(r.revenue), avgTime: r.timeCount > 0 ? Math.round(r.totalTime / r.timeCount) : 0 }))
                .sort((a, b) => b.deliveries - a.deliveries);
              return restData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={restData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis fontSize={12} />
                    <Tooltip formatter={(v: number, name: string) => name === 'revenue' ? `D${v.toLocaleString()}` : name === 'avgTime' ? `${v}m` : v} />
                    <Bar dataKey="deliveries" fill="hsl(220, 70%, 50%)" name="Deliveries" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="revenue" fill="hsl(145, 60%, 42%)" name="Revenue (D)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avgTime" fill="hsl(38, 92%, 50%)" name="Avg Time (min)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-10">No merchant data yet</p>;
            })()}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Rider Performance</CardTitle></CardHeader>
          <CardContent>
            {riderPerf.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={riderPerf}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="deliveries" fill="hsl(220, 70%, 50%)" name="Deliveries" />
                  <Bar dataKey="distance" fill="hsl(145, 60%, 42%)" name="Distance (km)" />
                  <Bar dataKey="efficiency" fill="hsl(38, 92%, 50%)" name="Efficiency %" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-10">No rider data yet</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
