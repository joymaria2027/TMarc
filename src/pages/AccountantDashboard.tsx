import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Receipt, CheckCircle2, Clock, DollarSign, AlertTriangle, ArrowDownToLine } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { formatMoney, CHART_COLORS } from '@/lib/finance';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import WalletWidget from '@/components/WalletWidget';
import EmptyState from '@/components/EmptyState';
import DashboardTour, { TourReplay } from '@/components/DashboardTour';
import GettingStartedChecklist from '@/components/GettingStartedChecklist';
import { useChecklistOpen } from '@/components/useChecklistOpen';
import { buildAccountantChecklist } from '@/lib/dashboardChecklists';
import { dashboardEmptyStates } from '@/lib/dashboardEmptyStates';

export default function AccountantDashboard() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Debounced realtime reload — bursts of events trigger one fetch, not one per event.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => { void load(); }, 400);
  };

  const load = async () => {
    const [delRes, alertRes, wrRes, expRes] = await Promise.all([
      supabase.from('deliveries').select('*').eq('status', 'delivered').order('delivered_at', { ascending: false }),
      supabase.from('delivery_alerts').select('*').eq('is_resolved', false),
      supabase.from('withdrawal_requests').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('rider_expenses').select('*').eq('status', 'pending'),
    ]);
    setDeliveries(delRes.data || []);
    setAlerts(alertRes.data || []);
    setWithdrawals(wrRes.data || []);
    setExpenses(expRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel('accountant-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_expenses' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); supabase.removeChannel(ch); };
  }, []);

  // First-run signal (pre-gate so hooks stay unconditional).
  const firstRun = deliveries.length === 0;
  const pendingCount = deliveries.filter((d) => !d.settlement_approved).length;
  const checklistItems = buildAccountantChecklist({
    settledCount: deliveries.filter((d) => d.settlement_approved).length,
    withdrawalsTotal: withdrawals.length,
    withdrawalsPending: withdrawals.filter((w) => w.status === 'pending').length,
    deliveredTotal: deliveries.length,
    pendingSettlements: pendingCount,
  });
  const [showChecklist, setShowChecklist] = useChecklistOpen("accountant", firstRun, checklistItems.every((i) => i.done));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const pendingSettlements = deliveries.filter(d => !d.settlement_approved).length;
  const approvedSettlements = deliveries.filter(d => d.settlement_approved).length;
  const totalRevenue = deliveries.reduce((s, d) => s + Number(d.actual_tariff ?? d.estimated_tariff ?? 0), 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');

  // Daily chart
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const day = format(date, 'EEE');
    const dayDels = deliveries.filter(d => d.delivered_at && format(new Date(d.delivered_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
    return {
      day,
      settled: dayDels.filter(d => d.settlement_approved).length,
      pending: dayDels.filter(d => !d.settlement_approved).length,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Accountant Dashboard</h1>
          <p className="text-muted-foreground">Settlement processing & financial overview</p>
        </div>
        <TourReplay role="accountant" />
      </div>
      <DashboardTour role="accountant" runWhen={firstRun} />

      {/* Operational strip (replaces hero-metric stat tiles banned by PRODUCT.md) */}
      <Card data-tour="acct-strip">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <Link to="/settlements" className="flex items-center gap-1.5 hover:underline underline-offset-4">
            <Clock className="h-4 w-4 text-warning" aria-hidden="true" /><strong className="tabular-nums">{pendingSettlements}</strong>&nbsp;pending settlement ({approvedSettlements} approved)
          </Link>
          <Link to="/wallet" className="flex items-center gap-1.5 hover:underline underline-offset-4">
            <ArrowDownToLine className="h-4 w-4 text-destructive" aria-hidden="true" /><strong className="tabular-nums">{pendingWithdrawals.length}</strong>&nbsp;pending withdrawals
          </Link>
          <Link to="/alerts" className="flex items-center gap-1.5 hover:underline underline-offset-4">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" /><strong className="tabular-nums">{alerts.length}</strong>&nbsp;open alerts
          </Link>
          <Link to="/analytics" className="flex items-center gap-1.5 hover:underline underline-offset-4">
            <DollarSign className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totalRevenue)}</strong>&nbsp;delivered revenue
          </Link>
        </CardContent>
      </Card>

      {/* First-run: no delivered data yet — one CTA, not blank charts */}
      {deliveries.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState {...dashboardEmptyStates.accountant.settlements} />
          </CardContent>
        </Card>
      )}

      {/* First-run: checklist replaces the charts until real data arrives */}
      {showChecklist ? (
        <GettingStartedChecklist role="accountant" items={checklistItems} onOpenChange={setShowChecklist} />
      ) : (
      <div className="grid md:grid-cols-2 gap-4">
        <Card data-tour="acct-settlements">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />Settlements (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="settled" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} name="Settled" stackId="a" />
                <Bar dataKey="pending" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="Pending" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div data-tour="acct-wallet"><WalletWidget /></div>
      </div>
      )}

      {/* Pending withdrawal requests */}
      {pendingWithdrawals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-destructive" />
              Pending Withdrawal Requests
              <Badge variant="destructive">{pendingWithdrawals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingWithdrawals.map(w => (
                <div key={w.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium tabular-nums">{formatMoney(Number(w.amount))}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(w.created_at), 'MMM d, HH:mm')}</p>
                    {w.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{w.notes}</p>}
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending expenses */}
      {expenses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Rider Expenses ({expenses.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expenses.slice(0, 5).map(e => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(Number(e.amount))} · {format(new Date(e.expense_date), 'MMM d')}</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
