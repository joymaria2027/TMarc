import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Users, AlertTriangle, CheckCircle2, Clock, MapPin, Bell, DollarSign, TrendingUp, Package } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import WalletWidget from '@/components/WalletWidget';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, active: 0, delivered: 0, flagged: 0, riders: 0, alerts: 0, revenue: 0, onlineRiders: 0 });
  const [recentDeliveries, setRecentDeliveries] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [delivRes, riderRes, alertRes, recentRes, notifRes] = await Promise.all([
      supabase.from('deliveries').select('status, is_flagged, created_at, actual_tariff, estimated_tariff'),
      supabase.from('riders').select('id, is_online'),
      supabase.from('delivery_alerts').select('id').eq('is_resolved', false),
      supabase.from('deliveries').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('tariff_notifications').select('*').order('created_at', { ascending: false }).limit(20),
    ]);

    const deliveries = delivRes.data || [];
    const riders = riderRes.data || [];
    const totalRevenue = deliveries
      .filter(d => d.status === 'delivered')
      .reduce((sum, d) => sum + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0);

    setStats({
      total: deliveries.length,
      active: deliveries.filter(d => ['dispatched', 'in_transit', 'picked_up'].includes(d.status)).length,
      delivered: deliveries.filter(d => d.status === 'delivered').length,
      flagged: deliveries.filter(d => d.is_flagged).length,
      riders: riders.length,
      onlineRiders: riders.filter(r => r.is_online).length,
      alerts: alertRes.data?.length || 0,
      revenue: totalRevenue,
    });
    setRecentDeliveries(recentRes.data || []);
    setNotifications(notifRes.data || []);

    // Build daily delivery chart data (last 7 days)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      const dayStart = startOfDay(date);
      const dayStr = format(date, 'EEE');
      const dayDeliveries = deliveries.filter(d => {
        const created = new Date(d.created_at);
        return created >= dayStart && created < new Date(dayStart.getTime() + 86400000);
      });
      return {
        day: dayStr,
        deliveries: dayDeliveries.length,
        completed: dayDeliveries.filter(d => d.status === 'delivered').length,
        revenue: dayDeliveries
          .filter(d => d.status === 'delivered')
          .reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0),
      };
    });
    setDailyData(last7);

    // Status breakdown for pie chart
    const statusCounts: Record<string, number> = {};
    deliveries.forEach(d => { statusCounts[d.status] = (statusCounts[d.status] || 0) + 1; });
    setStatusData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

    setLoading(false);
  };

  useEffect(() => {
    load();
    const delivChannel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .subscribe();
    const notifChannel = supabase
      .channel('tariff-notif-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tariff_notifications' }, (payload) => {
        setNotifications(prev => [payload.new as any, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(delivChannel); supabase.removeChannel(notifChannel); };
  }, []);

  const markNotifRead = async (id: string) => {
    if (!user) return;
    const notif = notifications.find(n => n.id === id);
    const readBy = notif?.read_by || [];
    if (readBy.includes(user.id)) return;
    await supabase.from('tariff_notifications').update({ read_by: [...readBy, user.id] }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_by: [...readBy, user.id] } : n));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const unreadNotifs = notifications.filter(n => !n.read_by?.includes(user?.id));
  const PIE_COLORS = ['hsl(220, 70%, 50%)', 'hsl(145, 60%, 42%)', 'hsl(38, 92%, 50%)', 'hsl(0, 72%, 51%)', 'hsl(200, 80%, 50%)', 'hsl(280, 60%, 50%)'];

  const statCards = [
    { label: 'Total Deliveries', value: stats.total, icon: <Package className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Active Now', value: stats.active, icon: <Clock className="h-5 w-5" />, color: 'text-info', bg: 'bg-info/10' },
    { label: 'Completed', value: stats.delivered, icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Revenue', value: `D${stats.revenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Riders Online', value: `${stats.onlineRiders}/${stats.riders}`, icon: <Users className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Open Alerts', value: stats.alerts, icon: <AlertTriangle className="h-5 w-5" />, color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of delivery operations</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`${s.bg} ${s.color} p-2 rounded-lg`}>{s.icon}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />Daily Deliveries (Last 7 Days)
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" />Revenue Trend (Last 7 Days)
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
      </div>

      {/* Status pie + Notifications side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Delivery Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                      {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 text-sm">
                  {statusData.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="capitalize">{s.name.replace('_', ' ')}</span>
                      <span className="text-muted-foreground">({s.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-center text-muted-foreground py-8">No data yet</p>}
          </CardContent>
        </Card>

        {/* Tariff Notifications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Tariff Notifications
              {unreadNotifs.length > 0 && <Badge variant="destructive" className="text-xs">{unreadNotifs.length} new</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {notifications.length > 0 ? notifications.slice(0, 10).map(n => {
                const isUnread = !n.read_by?.includes(user?.id);
                return (
                  <div key={n.id} className={`flex items-start justify-between py-2 border-b last:border-0 ${isUnread ? 'bg-primary/5 rounded px-2' : ''}`}>
                    <div className="flex items-start gap-2 min-w-0">
                      <DollarSign className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className={`text-sm truncate ${isUnread ? 'font-semibold' : ''}`}>{n.message}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(n.created_at), 'MMM d, HH:mm')}</p>
                      </div>
                    </div>
                    {isUnread && <Button size="sm" variant="ghost" className="text-xs shrink-0" onClick={() => markNotifRead(n.id)}>Read</Button>}
                  </div>
                );
              }) : <p className="text-center text-muted-foreground py-4 text-sm">No notifications</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Deliveries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentDeliveries.map(d => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.order_reference || d.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.pickup_address} → {d.dropoff_address}</p>
                    {d.estimated_tariff && <p className="text-xs text-muted-foreground">D{Number(d.estimated_tariff).toLocaleString()}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.is_flagged && <Badge variant="destructive">Flagged</Badge>}
                  <Badge variant="secondary" className="capitalize">{d.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            ))}
            {recentDeliveries.length === 0 && <p className="text-center text-muted-foreground py-4">No deliveries yet</p>}
          </div>
        </CardContent>
      </Card>
      {/* Wallet Summary */}
      <WalletWidget />
    </div>
  );
}
