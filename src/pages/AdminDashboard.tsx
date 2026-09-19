import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Users, AlertTriangle, CheckCircle2, Clock, MapPin, Bell, DollarSign, TrendingUp, Package } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';
import { formatMoney, CHART_COLORS } from '@/lib/finance';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import WalletWidget from '@/components/WalletWidget';
import EmptyState from '@/components/EmptyState';
import DashboardTour, { TourReplay } from '@/components/DashboardTour';
import GettingStartedChecklist from '@/components/GettingStartedChecklist';
import { useChecklistOpen } from '@/components/useChecklistOpen';
import { buildAdminChecklist } from '@/lib/dashboardChecklists';
import { dashboardEmptyStates } from '@/lib/dashboardEmptyStates';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, active: 0, delivered: 0, flagged: 0, riders: 0, alerts: 0, revenue: 0, onlineRiders: 0 });
  const [recentDeliveries, setRecentDeliveries] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Debounced realtime reload — bursts of events trigger one fetch, not one per event.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load(); }, 400);
  };

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => scheduleReload())
      .subscribe();
    const notifChannel = supabase
      .channel('tariff-notif-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tariff_notifications' }, (payload) => {
        setNotifications(prev => [payload.new as any, ...prev]);
      })
      .subscribe();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); supabase.removeChannel(delivChannel); supabase.removeChannel(notifChannel); };
  }, []);

  const markNotifRead = async (id: string) => {
    if (!user) return;
    const notif = notifications.find(n => n.id === id);
    const readBy = notif?.read_by || [];
    if (readBy.includes(user.id)) return;
    const { error } = await supabase.from('tariff_notifications').update({ read_by: [...readBy, user.id] }).eq('id', id);
    if (error) { toast.error(error.message); return; } // keep unread on failure
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_by: [...readBy, user.id] } : n));
  };

  // First-run signal (pre-gate so hooks stay unconditional).
  const firstRun = stats.total === 0;
  const checklistItems = buildAdminChecklist({
    total: stats.total,
    active: stats.active,
    delivered: stats.delivered,
    settled: recentDeliveries.some((d) => d.settlement_approved),
  });
  const [showChecklist, setShowChecklist] = useChecklistOpen("admin", firstRun, checklistItems.every((i) => i.done));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const unreadNotifs = notifications.filter(n => !n.read_by?.includes(user?.id));
  const PIE_COLORS = CHART_COLORS;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of delivery operations</p>
        </div>
        <TourReplay role="admin" />
      </div>
      <DashboardTour role="admin" runWhen={firstRun} />

      {/* Operational strip (replaces hero-metric stat tiles banned by PRODUCT.md) */}
      <Card data-tour="admin-strip">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-info" aria-hidden="true" /><strong className="tabular-nums">{stats.active}</strong>&nbsp;active now</span>
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" aria-hidden="true" /><strong className="tabular-nums">{stats.onlineRiders}/{stats.riders}</strong>&nbsp;riders online</span>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" /><strong className="tabular-nums">{stats.alerts}</strong>&nbsp;open alerts</span>
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{stats.delivered}</strong>&nbsp;completed of {stats.total}</span>
          <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(stats.revenue)}</strong>&nbsp;revenue</span>
        </CardContent>
      </Card>

      {/* First-run: checklist replaces the charts until real data arrives */}
      {showChecklist ? (
        <GettingStartedChecklist role="admin" items={checklistItems} onOpenChange={setShowChecklist} />
      ) : (
      /* Charts */
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" />Revenue Trend (Last 7 Days)
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
      </div>
      )}

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
            ) : <EmptyState {...dashboardEmptyStates.admin.status} />}
          </CardContent>
        </Card>

        {/* Tariff Notifications */}
        <Card data-tour="admin-notices">
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
              }) : <EmptyState {...dashboardEmptyStates.admin.notifications} />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Deliveries */}
      <Card data-tour="admin-recent">
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
                    {d.estimated_tariff && <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(Number(d.estimated_tariff))}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.is_flagged && <Badge variant="destructive">Flagged</Badge>}
                  <Badge variant="secondary" className="capitalize">{d.status.replace('_', ' ')}</Badge>
                </div>
              </div>
            ))}
            {recentDeliveries.length === 0 && <EmptyState {...dashboardEmptyStates.admin.deliveries} />}
          </div>
        </CardContent>
      </Card>
      {/* Wallet Summary */}
      <WalletWidget />
    </div>
  );
}
