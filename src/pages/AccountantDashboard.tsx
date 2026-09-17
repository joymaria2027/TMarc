import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Receipt, CheckCircle2, Clock, DollarSign, AlertTriangle, Package, ArrowDownToLine } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import WalletWidget from '@/components/WalletWidget';

export default function AccountantDashboard() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_expenses' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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

  const statCards = [
    { label: 'Delivered', value: deliveries.length, icon: <Package className="h-5 w-5" />, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending Settlement', value: pendingSettlements, icon: <Clock className="h-5 w-5" />, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Approved', value: approvedSettlements, icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Revenue', value: `D${totalRevenue.toLocaleString()}`, icon: <DollarSign className="h-5 w-5" />, color: 'text-accent', bg: 'bg-accent/10' },
    { label: 'Pending Withdrawals', value: pendingWithdrawals.length, icon: <ArrowDownToLine className="h-5 w-5" />, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Open Alerts', value: alerts.length, icon: <AlertTriangle className="h-5 w-5" />, color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accountant Dashboard</h1>
        <p className="text-muted-foreground">Settlement processing & financial overview</p>
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
              <Receipt className="h-4 w-4 text-primary" />Settlements (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="settled" fill="hsl(145, 60%, 42%)" radius={[4, 4, 0, 0]} name="Settled" stackId="a" />
                <Bar dataKey="pending" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} name="Pending" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <WalletWidget />
      </div>

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
                    <p className="text-sm font-medium">D {Number(w.amount).toFixed(2)}</p>
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
                    <p className="text-xs text-muted-foreground">D {Number(e.amount).toFixed(2)} · {format(new Date(e.expense_date), 'MMM d')}</p>
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
