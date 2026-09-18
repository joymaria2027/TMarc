import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Upload, Plus, DollarSign, FileText, CheckCircle2, XCircle, Bell, Clock, History, Fuel, ChevronDown, ChevronUp, Eye, MapPin, Download, X, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableCaption, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DeliveryMap from '@/components/DeliveryMap';
import ExpenseFormDialog from '@/components/expenses/ExpenseFormDialog';
import ExpenseRow from '@/components/expenses/ExpenseRow';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/finance';
import { buildCsvRows, downloadCsv, generateFilename } from '@/lib/financeExport';

export default function RiderExpensesPage() {
  const { user, hasRole } = useAuth();

  interface RiderWithProfile {
    id: string;
    user_id: string;
    license_plate: string | null;
    profile: { full_name?: string | null; email?: string | null } | null;
  }

  interface Merchant {
    id: string;
    name: string;
    manager_user_id: string | null;
    accountant_user_id: string | null;
  }

  interface ExpenseItem {
    id: string;
    rider_id: string;
    merchant_id: string | null;
    expense_type_id: string | null;
    uploaded_by: string;
    description: string;
    amount: number;
    consumed_amount: number | null;
    receipt_url: string | null;
    expense_date: string;
    status: string;
    created_at: string;
    deducted_in_delivery_id: string | null;
  }

  interface ExpenseType {
    id: string;
    name: string;
    is_fuel: boolean | null;
  }

  interface Alert {
    id: string;
    rider_id: string;
    expense_id: string;
    merchant_id: string;
    alert_type: string;
    message: string;
    target_role: string;
    is_read: boolean;
    created_at: string;
  }

  interface Consumption {
    id: string;
    rider_expense_id: string;
    delivery_id: string;
    amount_consumed: number;
    kind: string;
    created_at: string;
  }

  interface Delivery {
    id: string;
    order_reference: string | null;
    delivered_at: string | null;
    created_at: string;
    status: string;
    pickup_address: string | null;
    dropoff_address: string | null;
    pickup_latitude: number | null;
    pickup_longitude: number | null;
    dropoff_latitude: number | null;
    dropoff_longitude: number | null;
    actual_distance_km: number | null;
    estimated_distance_km: number | null;
    estimated_tariff: number | null;
    actual_tariff: number | null;
    dispatched_at: string | null;
    picked_up_at: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    payment_method: string | null;
    payment_bank_name: string | null;
    settlement_approved: boolean;
  }

  interface Waypoint {
    id: string;
    delivery_id: string;
    latitude: number;
    longitude: number;
    recorded_at: string;
  }

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [riders, setRiders] = useState<RiderWithProfile[]>([]);
  const [merchantRiderPairs, setMerchantRiderPairs] = useState<Set<string>>(new Set());
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [deliveriesMap, setDeliveriesMap] = useState<Record<string, Delivery>>({});
  const [highlighted, setHighlighted] = useState<Record<string, number>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const prevConsumedRef = useRef<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expensesVisible, setExpensesVisible] = useState(20);
  const EXPENSES_PAGE_SIZE = 20;
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [selectedWaypoints, setSelectedWaypoints] = useState<Waypoint[]>([]);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ rider_id: '', merchant_id: '', expense_type_id: '', description: '', amount: '', expense_date: new Date().toISOString().split('T')[0] });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Filters
  const [expenseDateFrom, setExpenseDateFrom] = useState('');
  const [expenseDateTo, setExpenseDateTo] = useState('');
  const [expenseAmountMin, setExpenseAmountMin] = useState('');
  const [expenseAmountMax, setExpenseAmountMax] = useState('');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string[]>([]);
  const [expenseSearch, setExpenseSearch] = useState('');

  // Bulk selection
  const [expenseSelectedIds, setExpenseSelectedIds] = useState<Set<string>>(new Set());
  const [expenseBulkActionPending, setExpenseBulkActionPending] = useState<'verify' | 'reject' | null>(null);

  const isRiderOnly = hasRole('rider') && !hasRole('admin') && !hasRole('accountant') && !hasRole('app_developer');
  const isManager = hasRole('company_manager') && !hasRole('admin');
  const canUpload = hasRole('admin') || hasRole('accountant') || hasRole('app_developer');
  const canVerify = hasRole('company_manager') || hasRole('admin');

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('rider_expenses').select('*').order('created_at', { ascending: false });

    if (expenseDateFrom) query = query.gte('expense_date', expenseDateFrom);
    if (expenseDateTo) query = query.lte('expense_date', expenseDateTo);
    if (expenseAmountMin) query = query.gte('amount', Number(expenseAmountMin));
    if (expenseAmountMax) query = query.lte('amount', Number(expenseAmountMax));
    if (expenseStatusFilter.length > 0) query = query.in('status', expenseStatusFilter);

    const [ridersRes, restRes, profilesRes, expRes, alertsRes, typesRes, consRes, mrRes] = await Promise.all([
      supabase.from('riders').select('id, user_id, license_plate'),
      supabase.from('merchants').select('id, name, manager_user_id, accountant_user_id'),
      supabase.rpc('get_public_profiles'),
      query,
      supabase.from('expense_alerts').select('*').eq('is_read', false).order('created_at', { ascending: false }),
      supabase.from('expense_types').select('*').eq('is_active', true).order('name'),
      supabase.from('rider_expense_consumptions').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('merchant_riders').select('merchant_id, rider_id'),
    ]);

    const profileMap = Object.fromEntries(
      ((profilesRes.data || []) as { user_id: string; full_name?: string | null; email?: string | null }[]).map(p => [p.user_id, p])
    );
    const ridersWithProfile = (ridersRes.data || []).map(r => ({ ...r, profile: profileMap[r.user_id] }));
    setRiders(ridersWithProfile);
    setMerchants(restRes.data || []);
    setMerchantRiderPairs(new Set(
      ((mrRes.data || []) as { merchant_id: string; rider_id: string }[]).map(p => `${p.merchant_id}:${p.rider_id}`),
    ));

    // Detect remaining-amount changes for highlight
    const newExp = (expRes.data || []) as ExpenseItem[];
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
    setAlerts((alertsRes.data || []) as Alert[]);
    setExpenseTypes((typesRes.data || []) as ExpenseType[]);
    const cons = (consRes.data || []) as Consumption[];
    setConsumptions(cons);

    // Fetch deliveries referenced by consumptions for labels
    const deliveryIds = Array.from(new Set(cons.map(c => c.delivery_id))).slice(0, 200);
    if (deliveryIds.length) {
      const { data: delvs } = await supabase
        .from('deliveries')
        .select('id, order_reference, delivered_at, created_at, status, pickup_address, dropoff_address, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, actual_distance_km, estimated_distance_km, estimated_tariff, actual_tariff, dispatched_at, picked_up_at, customer_name, customer_phone, payment_method, payment_bank_name, settlement_approved')
        .in('id', deliveryIds);
      setDeliveriesMap(Object.fromEntries(((delvs || []) as Delivery[]).map(d => [d.id, d])));
    }
    setLoading(false);
  }, [expenseDateFrom, expenseDateTo, expenseAmountMin, expenseAmountMax, expenseStatusFilter]);

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries' }, (payload: { new: { settlement_approved: boolean } }) => {
        if (payload?.new?.settlement_approved === true) scheduleReload();
      })
      .subscribe();
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); };
  }, [load]);

  const getRiderName = useCallback((riderId: string) => {
    const r = riders.find(r => r.id === riderId);
    return r?.profile?.full_name || r?.license_plate || riderId?.slice(0, 8);
  }, [riders]);

  const getMerchantName = useCallback((restId: string) => {
    return merchants.find(r => r.id === restId)?.name || restId?.slice(0, 8);
  }, [merchants]);

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
  const consumptionsByDelivery = consumptions.reduce<Record<string, Consumption[]>>((acc, c) => {
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
        message: `New expense of ${formatMoney(amt)} for ${riderName} (${form.description}) at ${restName} – awaiting verification`,
        target_role: 'company_manager',
      },
      {
        rider_id: form.rider_id,
        expense_id: expenseData.id,
        merchant_id: form.merchant_id,
        alert_type: 'new_expense',
        message: `An expense of ${formatMoney(amt)} (${form.description}) has been recorded for you at ${restName}`,
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

  const verifyExpense = async (expense: ExpenseItem, action: 'verified' | 'rejected') => {
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
      message: `Your expense of ${formatMoney(Number(expense.amount))} (${expense.description}) at ${restName} has been ${label}`,
      target_role: 'rider',
    });

    toast.success(`Expense ${label}`);
    load();
  };

  // Filtered expenses with client-side search (merchant/rider name search)
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (expenseSearch) {
        const q = expenseSearch.toLowerCase();
        const riderName = getRiderName(e.rider_id).toLowerCase();
        const merchantName = e.merchant_id ? getMerchantName(e.merchant_id).toLowerCase() : '';
        return riderName.includes(q) || merchantName.includes(q);
      }
      return true;
    });
  }, [expenses, expenseSearch, getRiderName, getMerchantName]);

  // Bulk selection handlers
  const toggleExpenseSelectAll = () => {
    if (expenseSelectedIds.size === filteredExpenses.length) {
      setExpenseSelectedIds(new Set());
    } else {
      setExpenseSelectedIds(new Set(filteredExpenses.map(e => e.id)));
    }
  };

  const toggleExpenseRow = (id: string) => {
    setExpenseSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isExpenseSelected = (id: string) => expenseSelectedIds.has(id);
  const isExpenseIndeterminate = expenseSelectedIds.size > 0 && expenseSelectedIds.size < filteredExpenses.length;

  const handleExpenseBulkAction = async (action: 'verified' | 'rejected') => {
    if (expenseSelectedIds.size === 0) return;
    setExpenseBulkActionPending(action);
    const ids = Array.from(expenseSelectedIds);
    let successCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const { error } = await supabase.from('rider_expenses').update({
        status: action,
        verified_by: user!.id,
        verified_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) {
        failCount++;
        toast.error(`Failed to ${action} ${id.slice(0, 8)}: ${error.message}`);
      } else {
        successCount++;
      }
    }
    if (successCount > 0) toast.success(`${successCount} ${successCount === 1 ? 'expense' : 'expenses'} ${action === 'verified' ? 'verified' : 'rejected'}`);
    setExpenseSelectedIds(prev => {
      const next = new Set(prev);
      if (failCount === 0) next.clear();
      return next;
    });
    setExpenseBulkActionPending(null);
    load();
  };

  // CSV Export
  const handleExpenseExportCsv = () => {
    const columns = [
      { key: 'expense_date', header: 'Date' },
      { key: 'description', header: 'Description' },
      { key: 'rider_name', header: 'Rider', format: (v: string) => v },
      { key: 'merchant_name', header: 'Merchant', format: (v: string) => v },
      { key: 'amount', header: 'Amount', format: (v: number) => formatMoney(v) },
      { key: 'consumed_amount', header: 'Consumed', format: (v: number | null) => formatMoney(v || 0) },
      { key: 'remaining', header: 'Remaining', format: (v: number) => formatMoney(v) },
      { key: 'status', header: 'Status' },
      { key: 'receipt_url', header: 'Receipt', format: (v: string | null) => v ? 'Attached' : 'No receipt' },
    ];
    const rowsWithNames = filteredExpenses.map(e => ({
      ...e,
      rider_name: getRiderName(e.rider_id),
      merchant_name: e.merchant_id ? getMerchantName(e.merchant_id) : '—',
      remaining: Math.max(Number(e.amount) - Number(e.consumed_amount || 0), 0),
    }));
    const csvRows = buildCsvRows(rowsWithNames, columns);
    downloadCsv(csvRows, generateFilename('rider-expenses'));
  };

  const clearExpenseFilters = () => {
    setExpenseSearch('');
    setExpenseStatusFilter([]);
    setExpenseDateFrom('');
    setExpenseDateTo('');
    setExpenseAmountMin('');
    setExpenseAmountMax('');
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
    const { error } = await supabase.from('expense_alerts').update({ is_read: true }).eq('id', alertId);
    if (error) { toast.error(error.message); return; } // keep the alert visible on failure
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const statusBadge = (status: string) => {
    if (status === 'verified') return <Badge className="bg-success/10 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" />Verified</Badge>;
    if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
    return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  };

  // Only riders actually assigned to the selected merchant (via merchant_riders).
  // Prevents mis-attributing an expense to a rider who doesn't work for that store.
  const ridersForMerchant = form.merchant_id
    ? riders.filter(r => merchantRiderPairs.has(`${form.merchant_id}:${r.id}`))
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
          {/* Filter Bar */}
          <Card className="border-muted/50">
            <CardContent className="flex flex-col sm:flex-row gap-3 p-3">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Label htmlFor="expense-date-from" className="sr-only">Date from</Label>
                <Input id="expense-date-from" type="date" className="w-36" value={expenseDateFrom} onChange={e => setExpenseDateFrom(e.target.value)} placeholder="From" />
                <Label htmlFor="expense-date-to" className="sr-only">Date to</Label>
                <Input id="expense-date-to" type="date" className="w-36" value={expenseDateTo} onChange={e => setExpenseDateTo(e.target.value)} placeholder="To" />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Label htmlFor="expense-amount-min" className="sr-only">Min amount</Label>
                <Input id="expense-amount-min" type="number" step="0.01" className="w-28" value={expenseAmountMin} onChange={e => setExpenseAmountMin(e.target.value)} placeholder="Min" />
                <Label htmlFor="expense-amount-max" className="sr-only">Max amount</Label>
                <Input id="expense-amount-max" type="number" step="0.01" className="w-28" value={expenseAmountMax} onChange={e => setExpenseAmountMax(e.target.value)} placeholder="Max" />
              </div>
              <div className="relative flex-1 max-w-sm">
                <Label htmlFor="expense-search" className="sr-only">Search rider or merchant</Label>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="expense-search" className="pl-9" placeholder="Search rider or merchant..." value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expense-status">Status</Label>
                <Select value={expenseStatusFilter.join(',')} onValueChange={v => setExpenseStatusFilter(v ? v.split(',') : [])} multiple>
                  <SelectTrigger id="expense-status" className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm" onClick={handleExpenseExportCsv} className="gap-1 min-h-[44px]">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />Export CSV
                </Button>
                {(expenseDateFrom || expenseDateTo || expenseAmountMin || expenseAmountMax || expenseStatusFilter.length > 0 || expenseSearch) && (
                  <Button variant="ghost" size="sm" onClick={clearExpenseFilters} className="gap-1 min-h-[44px]">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />Clear all
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {expensesVisible > 0 && filteredExpenses.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table aria-label="Rider expenses">
                  <TableCaption className="sr-only">Rider expense records with verification actions and receipt access</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        {canVerify && (
                          <Checkbox
                            checked={filteredExpenses.length > 0 && expenseSelectedIds.size === filteredExpenses.length}
                            indeterminate={isExpenseIndeterminate}
                            onCheckedChange={toggleExpenseSelectAll}
                            aria-label="Select all visible rows"
                            disabled={filteredExpenses.length === 0}
                          />
                        )}
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Rider</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Consumed</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Receipt</TableHead>
                      {canVerify && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.slice(0, expensesVisible).map(e => {
                      const rowCons = consumptions.filter(c => c.rider_expense_id === e.id);
                      const isHi = !!highlighted[e.id];
                      const remaining = Math.max(Number(e.amount) - Number(e.consumed_amount || 0), 0);
                      const showExpand = rowCons.length > 0;
                      return (
                        <>
                          <TableRow key={e.id} className={isHi ? 'ring-2 ring-primary motion-safe:animate-pulse' : ''}>
                            {canVerify && (
                              <TableCell className="w-12">
                                <Checkbox
                                  checked={isExpenseSelected(e.id)}
                                  onCheckedChange={() => toggleExpenseRow(e.id)}
                                  aria-label={`Select expense ${e.description}`}
                                />
                              </TableCell>
                            )}
                            <TableCell className="whitespace-nowrap tabular-nums"><time dateTime={e.expense_date}>{e.expense_date}</time></TableCell>
                            <TableCell className="font-medium">{e.description}</TableCell>
                            <TableCell>{getRiderName(e.rider_id)}</TableCell>
                            <TableCell>{e.merchant_id ? getMerchantName(e.merchant_id) : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(Number(e.amount))}</TableCell>
                            <TableCell className="text-right tabular-nums text-destructive">−{formatMoney(Number(e.consumed_amount || 0))}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">D{remaining.toFixed(2)}</TableCell>
                            <TableCell>
                              {e.status === 'verified' ? (
                                <Badge className="bg-success/10 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Verified</Badge>
                              ) : e.status === 'rejected' ? (
                                <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" aria-hidden="true" />Rejected</Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" aria-hidden="true" />Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {e.receipt_url ? (
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => handleOpenReceipt(e)} aria-label={`View receipt for ${e.description}`}>
                                  <FileText className="h-3 w-3" aria-hidden="true" />View
                                </Button>
                              ) : (
                                <Badge variant="secondary" className="text-xs">No receipt</Badge>
                              )}
                            </TableCell>
                            {canVerify && e.status === 'pending' && (
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" className="min-h-[44px] gap-1 text-success" onClick={() => verifyExpense(e, 'verified')}>
                                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Verify
                                  </Button>
                                  <Button size="sm" variant="outline" className="min-h-[44px] gap-1 text-destructive" onClick={() => verifyExpense(e, 'rejected')}>
                                    <XCircle className="h-3 w-3" aria-hidden="true" />Reject
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                          {showExpand && expandedRow === e.id && (
                            <TableRow>
                              <TableCell colSpan={canVerify ? 10 : 9} className="py-0">
                                <div className="space-y-1 text-xs rounded border bg-muted/20 px-3 py-2">
                                  {rowCons.map(c => (
                                    <div key={c.id} className="flex justify-between gap-2 items-center">
                                      <span className="text-muted-foreground">
                                        {format(new Date(c.created_at), 'MMM d HH:mm')} • delivery {deliveryLabel(c.delivery_id)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        {c.kind === 'fuel' ? <Fuel className="h-3 w-3" aria-hidden="true" /> : null}
                                        <Badge variant="outline" className="h-4 px-1 text-xs">{c.kind}</Badge>
                                        <span className="font-medium tabular-nums">D{Number(c.amount_consumed).toFixed(2)}</span>
                                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`View delivery ${c.delivery_id.slice(0, 8)}`} onClick={() => viewDelivery(c.delivery_id)}><Eye className="h-3 w-3" aria-hidden="true" /></Button>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                  {canVerify && expenseSelectedIds.size > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} />
                        <TableCell colSpan={canVerify ? 8 : 7} className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] gap-1 text-success"
                              onClick={() => handleExpenseBulkAction('verified')}
                              disabled={expenseBulkActionPending !== null}
                            >
                              {expenseBulkActionPending === 'verify' ? 'Verifying…' : 'Verify selected'}
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] gap-1 text-destructive"
                              onClick={() => handleExpenseBulkAction('rejected')}
                              disabled={expenseBulkActionPending !== null}
                            >
                              {expenseBulkActionPending === 'reject' ? 'Rejecting…' : 'Reject selected'}
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
              {expensesVisible < filteredExpenses.length && (
                <Button variant="outline" className="w-full" onClick={() => setExpensesVisible(v => v + EXPENSES_PAGE_SIZE)}>
                  Show more ({filteredExpenses.length - expensesVisible} remaining)
                </Button>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground" role="status">
              <Upload className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No expenses recorded yet</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-4">
          {deliveryOrder.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Consumption history">
                <TableCaption className="sr-only">Expense consumption history by delivery with deduction details</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delivery</TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Expense</TableHead>
                    <TableHead className="text-right">Consumed</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryOrder.map(did => {
                    const rows = consumptionsByDelivery[did];
                    const d = deliveriesMap[did];
                    return rows.map(c => {
                      const exp = expenseById(c.rider_expense_id);
                      const remainingAfter = exp ? Math.max(Number(exp.amount) - Number(exp.consumed_amount || 0), 0) : null;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">Delivery {deliveryLabel(did)}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums"><time dateTime={c.created_at}>{format(new Date(c.created_at), 'MMM d, yyyy HH:mm')}</time></TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              {c.kind === 'fuel' ? <Fuel className="h-3 w-3 text-primary" aria-hidden="true" /> : <DollarSign className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                              <Badge variant="outline" className="h-4 px-1 text-xs">{c.kind}</Badge>
                            </span>
                          </TableCell>
                          <TableCell className="truncate">{exp?.description || c.rider_expense_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-destructive">−D{Number(c.amount_consumed).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{remainingAfter != null ? formatMoney(remainingAfter) : '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`View delivery ${did.slice(0, 8)}`} onClick={() => viewDelivery(did)}><Eye className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground" role="status">
              <History className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No deductions yet</p>
            </div>
          )}
        </TabsContent>


        <TabsContent value="alerts" className="space-y-3 mt-4">
          {alerts.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Expense alerts">
                <TableCaption className="sr-only">Unread expense alerts with dismiss actions</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="whitespace-nowrap">Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Badge variant={a.alert_type === 'expense_rejected' ? 'destructive' : a.alert_type === 'expense_verified' ? 'default' : 'secondary'}>
                          {a.alert_type.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[400px] truncate">{a.message}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground"><time dateTime={a.created_at}>{format(new Date(a.created_at), 'MMM d, yyyy HH:mm')}</time></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => markAlertRead(a.id)} className="min-h-[44px]">Dismiss</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground" role="status">
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
