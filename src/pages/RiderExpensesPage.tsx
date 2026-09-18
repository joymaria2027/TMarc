import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Upload, Plus, DollarSign, FileText, CheckCircle2, XCircle, Bell, Clock, History, Fuel, ChevronDown, ChevronUp, Eye, MapPin } from 'lucide-react';
import DeliveryMap from '@/components/DeliveryMap';
import ExpenseFormDialog from '@/components/expenses/ExpenseFormDialog';
import ExpenseRow from '@/components/expenses/ExpenseRow';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

export default function RiderExpensesPage() {
  const { user, hasRole } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [consumptions, setConsumptions] = useState<any[]>([]);
  const [deliveriesMap, setDeliveriesMap] = useState<Record<string, any>>({});
  const [highlighted, setHighlighted] = useState<Record<string, number>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const prevConsumedRef = useRef<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expensesVisible, setExpensesVisible] = useState(20);
  const EXPENSES_PAGE_SIZE = 20;
  const [selectedDelivery, setSelectedDelivery] = useState<any | null>(null);
  const [selectedWaypoints, setSelectedWaypoints] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ rider_id: '', merchant_id: '', expense_type_id: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const isRiderOnly = hasRole('rider') && !hasRole('admin') && !hasRole('accountant') && !hasRole('app_developer');
  const isManager = hasRole('company_manager') && !hasRole('admin');
  const canUpload = hasRole('admin') || hasRole('accountant') || hasRole('app_developer');
  const canVerify = hasRole('company_manager') || hasRole('admin');

  const load = async () => {
    const [ridersRes, restRes, profilesRes, expRes, alertsRes, typesRes, consRes] = await Promise.all([
      supabase.from('riders').select('id, user_id, license_plate'),
      supabase.from('merchants').select('id, name, manager_user_id, accountant_user_id'),
      supabase.rpc('get_public_profiles'),
      supabase.from('rider_expenses').select('*').order('created_at', { ascending: false }),
      supabase.from('expense_alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }),
      supabase.from('expense_types').select('*').eq('is_active', true).order('name'),
      supabase.from('rider_expense_consumptions').select('*').order('created_at', { ascending: false }).limit(500),
    ]);

    const profileMap = Object.fromEntries(((profilesRes.data || []) as any[]).map((p: any) => [p.user_id, p]));
    const ridersWithProfile = (ridersRes.data || []).map(r => ({ ...r, profile: profileMap[r.user_id] }));
    setRiders(ridersWithProfile);
    setMerchants(restRes.data || []);

    // Detect remaining-amount changes for highlight
    const newExp = (expRes.data || []) as any[];
    const newHi: Record<string, number> = {};
    const now = Date.now();
    newExp.forEach(e => {
      const prev = prevConsumedRef.current[e.id];
      if (prev != null && Number(e.consumed_amount || 0) > prev) newHi[e.id] = now;
      prevConsumedRef.current[e.id] = Number(e.consumed_amount || 0);
    });
    if (Object.keys(newHi).length) {
      setHighlighted(h => ({ ...h, ...newHi }));
      setTimeout(() => setHighlighted(h => {
        const copy = { ...h };
        Object.keys(newHi).forEach(k => { if (copy[k] === newHi[k]) delete copy[k]; });
        return copy;
      }), 1500);
    }

    setExpenses(newExp);
    setAlerts(alertsRes.data || []);
    setExpenseTypes((typesRes.data as any[]) || []);
    const cons = (consRes.data || []) as any[];
    setConsumptions(cons);

    // Fetch deliveries referenced by consumptions for labels
    const deliveryIds = Array.from(new Set(cons.map(c => c.delivery_id))).slice(0, 200);
    if (deliveryIds.length) {
      const { data: delvs } = await supabase
        .from('deliveries')
        .select('id, order_reference, delivered_at, created_at, status, pickup_address, dropoff_address, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, actual_distance_km, estimated_distance_km, estimated_tariff, actual_tariff, dispatched_at, picked_up_at, customer_name, customer_phone, payment_method, payment_bank_name, settlement_approved')
        .in('id', deliveryIds);
      setDeliveriesMap(Object.fromEntries(((delvs || []) as any[]).map(d => [d.id, d])));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => load(), 600);
    };
    const channel = supabase
      .channel('expenses-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_expenses' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_alerts' }, () => scheduleReload())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_expense_consumptions' }, () => scheduleReload())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries' }, (payload: any) => {
        if (payload?.new?.settlement_approved === true) scheduleReload();
      })
      .subscribe();
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); };
  }, []);

  const getRiderName = (riderId: string) => {
    const r = riders.find(r => r.id === riderId);
    return r?.profile?.full_name || r?.license_plate || riderId?.slice(0, 8);
  };

  const getMerchantName = (restId: string) => {
    return merchants.find(r => r.id === restId)?.name || restId?.slice(0, 8);
  };

  const expenseById = (id: string) => expenses.find(e => e.id === id);
  const deliveryLabel = (id: string) => {
    const d = deliveriesMap[id];
    return d?.order_reference || id.slice(0, 8);
  };

  const viewDelivery = async (deliveryId: string) => {
    let delivery = deliveriesMap[deliveryId];
    if (!delivery) {
      const { data } = await supabase.from('deliveries').select('*').eq('id', deliveryId).maybeSingle();
      delivery = data || { id: deliveryId };
    }
    setSelectedDelivery(delivery);
    setSelectedWaypoints([]);
    const { data: wps } = await supabase
      .from('delivery_waypoints')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('recorded_at', { ascending: true });
    setSelectedWaypoints(wps || []);
  };

  // Group consumptions by delivery
  const consumptionsByDelivery = consumptions.reduce<Record<string, any[]>>((acc, c) => {
    (acc[c.delivery_id] ||= []).push(c);
    return acc;
  }, {});
  const deliveryOrder = Object.keys(consumptionsByDelivery).sort((a, b) => {
    const da = deliveriesMap[a]?.delivered_at || deliveriesMap[a]?.created_at || '';
    const db = deliveriesMap[b]?.delivered_at || deliveriesMap[b]?.created_at || '';
    return db.localeCompare(da);
  });

  const createExpense = async () => {
    if (!form.rider_id || !form.description || !form.expense_type_id) {
      toast.error('Rider, expense type and description are required');
      return;
    }
    setUploading(true);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      const ext = receiptFile.name.split('.').pop();
      const path = `expenses/${form.rider_id}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, receiptFile);
      if (uploadErr) { toast.error('Failed to upload receipt'); setUploading(false); return; }
      // Store the storage path; bucket is private, signed URLs are generated on view.
      receiptUrl = path;
    }


    const { data: expenseData, error } = await supabase.from('rider_expenses').insert({
      rider_id: form.rider_id,
      merchant_id: form.merchant_id,
      expense_type_id: form.expense_type_id || null,
      uploaded_by: user!.id,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      receipt_url: receiptUrl,
      expense_date: form.expense_date,
      status: 'pending',
    }).select().single();

    if (error) { toast.error(error.message); setUploading(false); return; }

    // Send alert to merchant manager for verification
    const riderName = getRiderName(form.rider_id);
    const restName = getMerchantName(form.merchant_id);
    const amt = parseFloat(form.amount) || 0;

    await supabase.from('expense_alerts').insert([
      {
        rider_id: form.rider_id,
        expense_id: expenseData.id,
        merchant_id: form.merchant_id,
        alert_type: 'new_expense',
        message: `New expense of D${amt.toLocaleString()} for ${riderName} (${form.description}) at ${restName} – awaiting verification`,
        target_role: 'company_manager',
      },
      {
        rider_id: form.rider_id,
        expense_id: expenseData.id,
        merchant_id: form.merchant_id,
        alert_type: 'new_expense',
        message: `An expense of D${amt.toLocaleString()} (${form.description}) has been recorded for you at ${restName}`,
        target_role: 'rider',
      },
    ]);

    toast.success('Expense recorded & alerts sent');
    setOpen(false);
    setReceiptFile(null);
    setForm({ rider_id: '', merchant_id: '', expense_type_id: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });
    setUploading(false);
    load();
  };

  const verifyExpense = async (expense: any, action: 'verified' | 'rejected') => {
    const { error } = await supabase.from('rider_expenses').update({
      status: action,
      verified_by: user!.id,
      verified_at: new Date().toISOString(),
    }).eq('id', expense.id);

    if (error) { toast.error(error.message); return; }

    const riderName = getRiderName(expense.rider_id);
    const restName = getMerchantName(expense.merchant_id);
    const label = action === 'verified' ? 'approved' : 'rejected';

    // Alert the rider
    await supabase.from('expense_alerts').insert({
      rider_id: expense.rider_id,
      expense_id: expense.id,
      merchant_id: expense.merchant_id,
      alert_type: action === 'verified' ? 'expense_verified' : 'expense_rejected',
      message: `Your expense of D${Number(expense.amount).toLocaleString()} (${expense.description}) at ${restName} has been ${label}`,
      target_role: 'rider',
    });

    toast.success(`Expense ${label}`);
    load();
  };

  const handleOpenReceipt = async (expense: { receipt_url?: string | null }) => {
    const key = expense.receipt_url as string;
    if (!key) return;
    const path = key.includes('/receipts/') ? key.split('/receipts/')[1] : key;
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error('Could not open receipt'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const markAlertRead = async (alertId: string) => {
    await supabase.from('expense_alerts').update({ is_read: true }).eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const statusBadge = (status: string) => {
    if (status === 'verified') return <Badge className="bg-success/10 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" />Verified</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  };

  // Filter riders by selected merchant
  const ridersForMerchant = form.merchant_id
    ? riders.filter(r => {
        // Check merchant_riders assignment
        return true; // We'll filter client-side if needed; for now show all
      })
    : riders;

  if (loading) return (
    <div role="status" aria-label="Loading rider expenses" className="space-y-3 py-6">
      <Skeleton className="shimmer h-20 w-full rounded-lg" />
      <Skeleton className="shimmer h-20 w-full rounded-lg" />
      <Skeleton className="shimmer h-20 w-full rounded-lg" />
      <span className="sr-only">Loading rider expenses…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rider Expenses</h1>
          <p className="text-muted-foreground">Maker-checker expense management with receipt verification</p>
        </div>
        {canUpload && (
          <ExpenseFormDialog
            open={open}
            onOpenChange={setOpen}
            form={form}
            onFormChange={(patch) => setForm(prev => ({ ...prev, ...patch }))}
            merchants={merchants}
            riders={ridersForMerchant}
            expenseTypes={expenseTypes}
            receiptFileName={receiptFile?.name || null}
            onReceiptFile={(f) => setReceiptFile(f)}
            onSubmit={createExpense}
            uploading={uploading}
          />
        )}
      </div>

      <Tabs defaultValue={alerts.length > 0 ? 'alerts' : 'expenses'}>
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="h-3 w-3" />Consumption history</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1">
            Alerts {alerts.length > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-xs">{alerts.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-3 mt-4">
          {expenses.slice(0, expensesVisible).map(e => {
            const rowCons = consumptions.filter(c => c.rider_expense_id === e.id);
            const isHi = !!highlighted[e.id];
            return (
              <ExpenseRow
                key={e.id}
                expense={e}
                riderName={getRiderName(e.rider_id)}
                merchantName={e.merchant_id ? getMerchantName(e.merchant_id) : null}
                consumptions={rowCons}
                isHighlighted={isHi}
                expanded={expandedRow === e.id}
                onToggleExpand={(open) => setExpandedRow(open ? e.id : null)}
                canVerify={canVerify}
                onVerify={(exp) => verifyExpense(exp, 'verified')}
                onReject={(exp) => verifyExpense(exp, 'rejected')}
                onOpenReceipt={handleOpenReceipt}
                onViewDelivery={viewDelivery}
                deliveryLabel={deliveryLabel}
              />
            );
          })}
          {expenses.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Upload className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No expenses recorded yet</p>
            </div>
          )}
          {expensesVisible < expenses.length && (
            <Button variant="outline" className="w-full" onClick={() => setExpensesVisible(v => v + EXPENSES_PAGE_SIZE)}>
              Show more ({expenses.length - expensesVisible} remaining)
            </Button>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-4">
          {deliveryOrder.map(did => {
            const rows = consumptionsByDelivery[did];
            const total = rows.reduce((s, r) => s + Number(r.amount_consumed), 0);
            const d = deliveriesMap[did];
            return (
              <Card key={did}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">Delivery {deliveryLabel(did)}</p>
                      <p className="text-xs text-muted-foreground">
                        {d?.delivered_at ? format(new Date(d.delivered_at), 'MMM d, yyyy HH:mm') : '—'}
                      </p>
                    </div>
                    <Badge variant="outline" className="gap-1"><DollarSign className="h-3 w-3" />D{total.toLocaleString()} deducted</Badge>
                  </div>
                  <div className="space-y-1 text-xs">
                    {rows.map(c => {
                      const exp = expenseById(c.rider_expense_id);
                      const remainingAfter = exp ? Math.max(Number(exp.amount) - Number(exp.consumed_amount || 0), 0) : null;
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {c.kind === 'fuel' ? <Fuel className="h-3 w-3 text-primary" /> : <DollarSign className="h-3 w-3 text-muted-foreground" />}
                            <Badge variant="outline" className="h-4 px-1 text-xs">{c.kind}</Badge>
                            <span className="truncate">{exp?.description || c.rider_expense_id.slice(0, 8)}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium">−D{Number(c.amount_consumed).toLocaleString()}</span>
                            {remainingAfter != null && (
                              <span className="text-muted-foreground">remaining D{remainingAfter.toLocaleString()}</span>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`View delivery ${did.slice(0, 8)}`} onClick={() => viewDelivery(did)}><Eye className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {deliveryOrder.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No deductions yet</p>
            </div>
          )}
        </TabsContent>


        <TabsContent value="alerts" className="space-y-3 mt-4">
          {alerts.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Bell className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={a.alert_type === 'expense_rejected' ? 'destructive' : a.alert_type === 'expense_verified' ? 'default' : 'secondary'}>
                        {a.alert_type.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => markAlertRead(a.id)} className="shrink-0">Dismiss</Button>
              </CardContent>
            </Card>
          ))}
          {alerts.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No unread alerts</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedDelivery} onOpenChange={(o) => { if (!o) { setSelectedDelivery(null); setSelectedWaypoints([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Delivery {selectedDelivery?.order_reference || selectedDelivery?.id?.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              {(selectedDelivery.pickup_latitude || selectedWaypoints.length > 0) ? (
                <DeliveryMap
                  waypoints={selectedWaypoints}
                  pickupLat={selectedDelivery.pickup_latitude}
                  pickupLng={selectedDelivery.pickup_longitude}
                  dropoffLat={selectedDelivery.dropoff_latitude}
                  dropoffLng={selectedDelivery.dropoff_longitude}
                  className="h-64 w-full rounded-lg"
                />
              ) : (
                <div className="h-32 flex items-center justify-center bg-muted/30 rounded-lg text-sm text-muted-foreground">
                  No location data available
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{selectedDelivery.status?.replace('_', ' ') || '—'}</Badge></div>
                <div><span className="text-muted-foreground">Waypoints:</span> {selectedWaypoints.length}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Pickup:</span> {selectedDelivery.pickup_address || '—'}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Drop-off:</span> {selectedDelivery.dropoff_address || '—'}</div>
                <div><span className="text-muted-foreground">Est. distance:</span> {selectedDelivery.estimated_distance_km ?? '—'} km</div>
                <div><span className="text-muted-foreground">Actual distance:</span> {selectedDelivery.actual_distance_km ?? '—'} km</div>
                <div><span className="text-muted-foreground">Est. tariff:</span> D{selectedDelivery.estimated_tariff ?? '—'}</div>
                <div><span className="text-muted-foreground">Actual tariff:</span> D{selectedDelivery.actual_tariff ?? '—'}</div>
                <div><span className="text-muted-foreground">Dispatched:</span> {selectedDelivery.dispatched_at ? format(new Date(selectedDelivery.dispatched_at), 'MMM d, HH:mm') : '—'}</div>
                <div><span className="text-muted-foreground">Picked up:</span> {selectedDelivery.picked_up_at ? format(new Date(selectedDelivery.picked_up_at), 'MMM d, HH:mm') : '—'}</div>
                <div><span className="text-muted-foreground">Delivered:</span> {selectedDelivery.delivered_at ? format(new Date(selectedDelivery.delivered_at), 'MMM d, HH:mm') : '—'}</div>
                <div><span className="text-muted-foreground">Settlement:</span> {selectedDelivery.settlement_approved ? 'Approved' : 'Pending'}</div>
                <div><span className="text-muted-foreground">Customer:</span> {selectedDelivery.customer_name || '—'}</div>
                <div><span className="text-muted-foreground">Phone:</span> {selectedDelivery.customer_phone || '—'}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Payment:</span> {selectedDelivery.payment_method ? (selectedDelivery.payment_method === 'bank_transfer' && selectedDelivery.payment_bank_name ? `Bank (${selectedDelivery.payment_bank_name})` : selectedDelivery.payment_method) : '—'}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
