import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export default function AlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    let query = supabase.from('delivery_alerts').select('*').order('created_at', { ascending: false });
    if (filter === 'unresolved') query = query.eq('is_resolved', false);
    if (filter === 'resolved') query = query.eq('is_resolved', true);
    const { data } = await query;
    setAlerts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_alerts' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  const resolveAlert = async (id: string) => {
    await supabase.from('delivery_alerts').update({ is_resolved: true, resolved_by: user?.id }).eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_resolved: true } : a));
    toast.success('Alert resolved');
  };

  const alertColor = (type: string) => {
    const map: Record<string, string> = {
      late_delivery: 'bg-warning/10 text-warning border-warning/20',
      route_deviation: 'bg-destructive/10 text-destructive border-destructive/20',
      suspicious: 'bg-destructive/10 text-destructive border-destructive/20',
      duplicate: 'bg-primary/10 text-primary border-primary/20',
      out_of_area: 'bg-destructive/10 text-destructive border-destructive/20',
      delivery_completed: 'bg-accent/10 text-accent border-accent/20',
      withdrawal_request: 'bg-primary/10 text-primary border-primary/20',
      withdrawal_completed: 'bg-accent/10 text-accent border-accent/20',
      withdrawal_rejected: 'bg-destructive/10 text-destructive border-destructive/20',
      wallet_credit: 'bg-accent/10 text-accent border-accent/20',
      wallet_credit_corrected: 'bg-warning/10 text-warning border-warning/20',
    };
    return map[type] || '';
  };

  const alertIcon = (type: string) => {
    if (['delivery_completed', 'withdrawal_completed', 'wallet_credit', 'wallet_credit_corrected'].includes(type)) return <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />;
    if (type === 'withdrawal_request') return <Bell className="h-4 w-4 text-primary shrink-0" />;
    return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
  };

  const unresolvedCount = alerts.filter(a => !a.is_resolved).length;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Alerts
            {unresolvedCount > 0 && <Badge variant="destructive">{unresolvedCount} active</Badge>}
          </h1>
          <p className="text-muted-foreground">Deliveries, withdrawals, and system notifications</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Alerts</SelectItem>
            <SelectItem value="unresolved">Active</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-3">
        {alerts.map(a => (
          <Card key={a.id} className={a.is_resolved ? 'opacity-60' : ''}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {alertIcon(a.alert_type)}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className={alertColor(a.alert_type)}>{a.alert_type.replace(/_/g, ' ')}</Badge>
                    {a.is_resolved && <Badge variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1" />Resolved</Badge>}
                  </div>
                  <p className="text-sm">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'MMM d, yyyy HH:mm:ss')}</p>
                </div>
              </div>
              {!a.is_resolved && (
                <Button size="sm" variant="outline" onClick={() => resolveAlert(a.id)} className="shrink-0">Resolve</Button>
              )}
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No alerts – all clear!</p>
          </div>
        )}
      </div>
    </div>
  );
}
