import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SettlementSummaryCards from '@/components/settlements/SettlementSummaryCards';
import MerchantSettlementCard from '@/components/settlements/MerchantSettlementCard';
import RiderSettlementCard from '@/components/settlements/RiderSettlementCard';
import DeliverySettlementRow from '@/components/settlements/DeliverySettlementRow';
import { partitionPayoutDeliveries, summarizeBulkResult } from '@/lib/moneyGuards';
import { formatMoney } from '@/lib/finance';
import { format } from 'date-fns';
import { buildCsvRows, downloadCsv, generateFilename } from '@/lib/financeExport';

interface SettlementRow {
  id: string;
  order_reference: string | null;
  pickup_address: string;
  dropoff_address: string;
  actual_distance_km: number | null;
  actual_tariff: number | null;
  estimated_tariff: number | null;
  receipt_attached: boolean;
  settlement_approved: boolean;
  delivered_at: string | null;
  rider_id: string | null;
  merchant_id: string;
  merchant_name: string;
  tariff: number;
  payment_method: string | null;
  payment_bank_name: string | null;
  sharing: {
    rider_percentage: number;
    merchant_percentage: number;
    platform_percentage: number;
    ucs_rides_percentage: number;
  } | null;
}

interface RiderSummary {
  rider_id: string;
  rider_name: string;
  total_deliveries: number;
  total_revenue: number;
  total_expenses: number;
  net_revenue: number;
  rider_share: number;
  net_payout: number;
  deliveries: SettlementRow[];
}

interface MerchantSummary {
  merchant_id: string;
  merchant_name: string;
  total_deliveries: number;
  total_revenue: number;
  total_expenses: number;
  net_revenue: number;
  merchant_share: number;
  platform_share: number;
  ucs_share: number;
  rider_share: number;
  deliveries: SettlementRow[];
}

export const DELIVERIES_PAGE_SIZE = 20;

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

interface SharingRow {
  merchant_id: string;
  rider_percentage: number;
  merchant_percentage: number;
  platform_percentage: number;
  ucs_rides_percentage: number;
}

interface TariffRow {
  merchant_id: string;
  tariff_amount: number | string;
}

interface MerchantRow {
  id: string;
  name: string;
}

interface RiderRow {
  id: string;
  user_id: string;
}

interface ProfileRow {
  user_id: string;
  full_name: string | null;
}

interface DeliveryRow {
  id: string;
  order_reference: string | null;
  pickup_address: string;
  dropoff_address: string;
  actual_distance_km: number | null;
  actual_tariff: number | null;
  estimated_tariff: number | null;
  receipt_attached: boolean;
  settlement_approved: boolean;
  delivered_at: string | null;
  rider_id: string | null;
  merchant_id: string;
  payment_method?: string | null;
  payment_bank_name?: string | null;
}

export default function SettlementsPage() {
  const { user, hasRole } = useAuth();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [deliveriesVisible, setDeliveriesVisible] = useState(DELIVERIES_PAGE_SIZE);
  const [riderSummaries, setRiderSummaries] = useState<RiderSummary[]>([]);
  const [merchantSummaries, setMerchantSummaries] = useState<MerchantSummary[]>([]);
  const [allExpenses, setAllExpenses] = useState<ExpenseItem[]>([]);
  const [restExpenseItemsMap, setRestExpenseItemsMap] = useState<Map<string, ExpenseItem[]>>(new Map());
  const [riderExpenseItemsMap, setRiderExpenseItemsMap] = useState<Map<string, ExpenseItem[]>>(new Map());
  const [deliveryExpenseItemsMap, setDeliveryExpenseItemsMap] = useState<Map<string, ExpenseItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [payingRiderId, setPayingRiderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Filters
  const [settlementDateFrom, setSettlementDateFrom] = useState('');
  const [settlementDateTo, setSettlementDateTo] = useState('');
  const [settlementAmountMin, setSettlementAmountMin] = useState('');
  const [settlementAmountMax, setSettlementAmountMax] = useState('');
  const [settlementStatusFilter, setSettlementStatusFilter] = useState<string[]>([]);
  const [settlementSearch, setSettlementSearch] = useState('');

  // Bulk selection for deliveries tab
  const [deliverySelectedIds, setDeliverySelectedIds] = useState<Set<string>>(new Set());
  const [deliveryBulkActionPending, setDeliveryBulkActionPending] = useState<'approve' | null>(null);

  const isAdmin = hasRole('admin');
  const isRiderOnly = hasRole('rider') && !isAdmin && !hasRole('accountant') && !hasRole('business_owner') && !hasRole('company_manager');
  const isManagerOnly = hasRole('company_manager') && !isAdmin;
  const isAccountantOnly = hasRole('accountant') && !isAdmin;

  const load = useCallback(async () => {
    // Determine merchant scope for managers/accountants
    let myMerchantIds: string[] | null = null;
    let myRiderId: string | null = null;

    if (isRiderOnly && user) {
      const { data: myRider } = await supabase.from('riders').select('id').eq('user_id', user.id).single();
      myRiderId = myRider?.id || null;
    }

    if ((isManagerOnly || isAccountantOnly) && user) {
      const { data: myRests } = await supabase.from('merchants').select('id');
      myMerchantIds = (myRests || []).map(r => r.id);
    }

    let delsQuery = supabase.from('deliveries').select('*').eq('status', 'delivered').order('delivered_at', { ascending: false });
    if (isRiderOnly && myRiderId) {
      delsQuery = delsQuery.eq('rider_id', myRiderId);
    }
    if (myMerchantIds && myMerchantIds.length > 0) {
      delsQuery = delsQuery.in('merchant_id', myMerchantIds);
    }
    if (settlementDateFrom) delsQuery = delsQuery.gte('delivered_at', settlementDateFrom);
    if (settlementDateTo) delsQuery = delsQuery.lte('delivered_at', settlementDateTo);
    if (settlementAmountMin) delsQuery = delsQuery.gte('actual_tariff', Number(settlementAmountMin));
    if (settlementAmountMax) delsQuery = delsQuery.lte('actual_tariff', Number(settlementAmountMax));
    if (settlementStatusFilter.length > 0) delsQuery = delsQuery.in('settlement_approved', settlementStatusFilter.map(s => s === 'approved'));

    const expensesQuery = isRiderOnly && myRiderId
      ? supabase.from('rider_expenses').select('*').eq('rider_id', myRiderId)
      : supabase.from('rider_expenses').select('*');

    const [delsRes, sharesRes, tariffsRes, restsRes, ridersRes, profilesRes, expensesRes] = await Promise.all([
      delsQuery,
      supabase.from('revenue_sharing').select('*'),
      supabase.from('merchant_tariffs').select('*'),
      supabase.from('merchants').select('id, name'),
      supabase.from('riders').select('id, user_id'),
      supabase.from('profiles').select('user_id, full_name'),
      expensesQuery,
    ]);

    const dels = delsRes.data || [];
    const shares = sharesRes.data || [];
    const tariffs = tariffsRes.data || [];
    const rests = restsRes.data || [];
    const riders = ridersRes.data || [];
    const profiles = profilesRes.data || [];
    const expenses = expensesRes.data || [];
    setAllExpenses(expenses);

    const merged: SettlementRow[] = dels.map((d: DeliveryRow) => {
      const s = shares.find((sh: SharingRow) => sh.merchant_id === d.merchant_id);
      const restTariffs = tariffs.filter((t: TariffRow) => t.merchant_id === d.merchant_id);
      const bestTariff = restTariffs.length > 0
        ? Math.max(...restTariffs.map((t: TariffRow) => Number(t.tariff_amount)))
        : 0;
      const rest = rests.find((r: MerchantRow) => r.id === d.merchant_id);
      const effectiveTariff = Number(d.actual_tariff ?? d.estimated_tariff ?? bestTariff);

      return {
        id: d.id,
        order_reference: d.order_reference,
        pickup_address: d.pickup_address,
        dropoff_address: d.dropoff_address,
        actual_distance_km: d.actual_distance_km,
        actual_tariff: d.actual_tariff,
        estimated_tariff: d.estimated_tariff,
        receipt_attached: d.receipt_attached,
        settlement_approved: d.settlement_approved,
        delivered_at: d.delivered_at,
        rider_id: d.rider_id,
        merchant_id: d.merchant_id,
        merchant_name: rest?.name || 'Unknown',
        tariff: effectiveTariff,
        payment_method: d.payment_method || null,
        payment_bank_name: d.payment_bank_name || null,
        sharing: s ? {
          rider_percentage: s.rider_percentage,
          merchant_percentage: s.merchant_percentage,
          platform_percentage: s.platform_percentage,
          ucs_rides_percentage: s.ucs_rides_percentage,
        } : null,
      };
    });

    // Build rider summaries
    const riderMap = new Map<string, RiderSummary>();
    for (const row of merged) {
      if (!row.rider_id) continue;
      if (!riderMap.has(row.rider_id)) {
        const rider = riders.find((r: RiderRow) => r.id === row.rider_id);
        const profile = rider ? profiles.find((p: ProfileRow) => p.user_id === rider.user_id) : null;
        const riderExpenses = expenses.filter((e: ExpenseItem) => e.rider_id === row.rider_id && (e.status === 'approved' || e.status === 'verified'));
        const totalExpenses = riderExpenses.reduce((sum: number, e: ExpenseItem) => sum + Number(e.amount), 0);

        riderMap.set(row.rider_id, {
          rider_id: row.rider_id,
          rider_name: profile?.full_name || 'Unknown Rider',
          total_deliveries: 0,
          total_revenue: 0,
          total_expenses: totalExpenses,
          net_revenue: 0,
          rider_share: 0,
          net_payout: 0,
          deliveries: [],
        });
      }
      const summary = riderMap.get(row.rider_id)!;
      summary.total_deliveries++;
      summary.total_revenue += row.tariff;
      summary.deliveries.push(row);
    }
    // Calculate shares from net revenue (total revenue - verified expenses)
    for (const summary of riderMap.values()) {
      summary.net_revenue = summary.total_revenue - summary.total_expenses;
      const firstDelivery = summary.deliveries[0];
      if (firstDelivery?.sharing) {
        summary.rider_share = summary.net_revenue * firstDelivery.sharing.rider_percentage / 100;
      }
      summary.net_payout = summary.rider_share;
    }

    // Build merchant summaries
    const restMap = new Map<string, MerchantSummary>();
    for (const row of merged) {
      if (!restMap.has(row.merchant_id)) {
        // Sum verified expenses for this merchant
        const restExpenses = expenses.filter((e: ExpenseItem) => e.merchant_id === row.merchant_id && (e.status === 'approved' || e.status === 'verified'));
        const totalRestExpenses = restExpenses.reduce((sum: number, e: ExpenseItem) => sum + Number(e.amount), 0);

        restMap.set(row.merchant_id, {
          merchant_id: row.merchant_id,
          merchant_name: row.merchant_name,
          total_deliveries: 0,
          total_revenue: 0,
          total_expenses: totalRestExpenses,
          net_revenue: 0,
          merchant_share: 0,
          platform_share: 0,
          ucs_share: 0,
          rider_share: 0,
          deliveries: [],
        });
      }
      const rs = restMap.get(row.merchant_id)!;
      rs.total_deliveries++;
      rs.total_revenue += row.tariff;
      rs.deliveries.push(row);
    }
    // Calculate shares from net revenue (total revenue - verified expenses)
    for (const rs of restMap.values()) {
      rs.net_revenue = rs.total_revenue - rs.total_expenses;
      const firstDelivery = rs.deliveries[0];
      if (firstDelivery?.sharing) {
        const s = firstDelivery.sharing;
        rs.merchant_share = rs.net_revenue * s.merchant_percentage / 100;
        rs.platform_share = rs.net_revenue * s.platform_percentage / 100;
        rs.ucs_share = rs.net_revenue * s.ucs_rides_percentage / 100;
        rs.rider_share = rs.net_revenue * s.rider_percentage / 100;
      }
    }

    setRows(merged);
    setRiderSummaries(Array.from(riderMap.values()).sort((a, b) => b.total_revenue - a.total_revenue));
    setMerchantSummaries(Array.from(restMap.values()).sort((a, b) => b.total_revenue - a.total_revenue));
    // Compute expense item maps for detailed breakdowns
    const restItemsMap = new Map<string, ExpenseItem[]>();
    for (const rs of restMap.values()) {
      const items = expenses.filter((e: ExpenseItem) => e.merchant_id === rs.merchant_id && (e.status === 'approved' || e.status === 'verified'));
      restItemsMap.set(rs.merchant_id, items);
    }
    const riderItemsMap = new Map<string, ExpenseItem[]>();
    for (const rs of riderMap.values()) {
      const items = expenses.filter((e: ExpenseItem) => e.rider_id === rs.rider_id && (e.status === 'approved' || e.status === 'verified'));
      riderItemsMap.set(rs.rider_id, items);
    }
    const deliveryItemsMap = new Map<string, ExpenseItem[]>();
    for (const row of merged) {
      const items = expenses.filter((e: ExpenseItem) => e.deducted_in_delivery_id === row.id);
      if (items.length > 0) deliveryItemsMap.set(row.id, items);
    }
    setRestExpenseItemsMap(restItemsMap);
    setRiderExpenseItemsMap(riderItemsMap);
    setDeliveryExpenseItemsMap(deliveryItemsMap);
    setLoading(false);
  }, [settlementDateFrom, settlementDateTo, settlementAmountMin, settlementAmountMax, settlementStatusFilter, isRiderOnly, isManagerOnly, isAccountantOnly, user]);

  useEffect(() => {
    load();
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => load(), 600);
    };
    const channel = supabase
      .channel('settlements-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_expenses' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); };
  }, [load]);

  const approveSettlement = async (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    if (!row.sharing) {
      toast.error('Set a sharing ratio for this merchant first');
      return;
    }
    await supabase.from('deliveries').update({
      settlement_approved: true,
      settlement_approved_by: user?.id,
    }).eq('id', id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, settlement_approved: true } : r));
    toast.success('Settlement approved');
  };

  const payout = (total: number, pct: number) => (total * pct / 100).toFixed(2);

  const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash', wave: 'Wave', qmoney: 'QMoney', afrimoney: 'Afrimoney',
    aps_wallet: 'APS Wallet', bank_transfer: 'Bank Transfer',
  };
  const paymentLabel = (d: SettlementRow) => {
    if (!d.payment_method) return null;
    const label = PAYMENT_LABELS[d.payment_method] || d.payment_method;
    return d.payment_method === 'bank_transfer' && d.payment_bank_name ? `${label} (${d.payment_bank_name})` : label;
  };

  const merchantNameById = (merchantId: string) =>
    merchantSummaries.find(r => r.merchant_id === merchantId)?.merchant_name || '';

  const handleIssuePayout = async (summary: RiderSummary) => {
    if (payingRiderId) return;
    const { approvable, skippedNoRatio } = partitionPayoutDeliveries(summary.deliveries);
    if (approvable.length === 0) {
      toast.error(
        skippedNoRatio.length > 0
          ? `${skippedNoRatio.length} ${skippedNoRatio.length === 1 ? 'delivery has' : 'deliveries have'} no sharing ratio — set it first`
          : 'Nothing to pay out'
      );
      return;
    }
    setPayingRiderId(summary.rider_id);
    // F1 (FRICTION-ANALYSIS-2026-09-18): a sequential loop can half-succeed —
    // report exactly which rows landed instead of a catch-all that over-claims
    // "no changes were confirmed" when earlier rows already did.
    const results = [] as { id: string; error: { message?: string } | null }[];
    for (const d of approvable) {
      const { error } = await supabase.from('deliveries').update({
        settlement_approved: true,
        settlement_approved_by: user?.id,
      }).eq('id', d.id);
      results.push({ id: d.id, error });
    }
    const bulk = summarizeBulkResult(results);
    const skippedNote = skippedNoRatio.length > 0 ? ` — ${skippedNoRatio.length} skipped (no sharing ratio)` : '';
    if (bulk.failed === 0) {
      toast.success(`Approved ${bulk.succeeded} ${bulk.succeeded === 1 ? 'settlement' : 'settlements'} for ${summary.rider_name} (net ${formatMoney(summary.net_payout)})${skippedNote}`);
    } else if (bulk.succeeded === 0) {
      toast.error(`Payout failed for ${summary.rider_name} — no changes were confirmed`);
    } else {
      const ids = bulk.failedIds.map(id => `#${id.slice(0, 8)}`).join(', ');
      toast.error(`Approved ${bulk.succeeded} of ${approvable.length} settlements for ${summary.rider_name}; ${bulk.failed} failed (${ids}) — retry the failed rows`);
    }
    setPayingRiderId(null);
    load();
  };

  // Filtered rows with client-side search (merchant/rider name search)
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (settlementSearch) {
        const q = settlementSearch.toLowerCase();
        const orderRef = (r.order_reference || '').toLowerCase();
        const merchantName = (r.merchant_name || '').toLowerCase();
        return orderRef.includes(q) || merchantName.includes(q);
      }
      return true;
    });
  }, [rows, settlementSearch]);

  // Bulk selection handlers for deliveries tab
  const toggleDeliverySelectAll = (visibleRows: SettlementRow[]) => {
    if (deliverySelectedIds.size === visibleRows.length) {
      setDeliverySelectedIds(new Set());
    } else {
      setDeliverySelectedIds(new Set(visibleRows.map(r => r.id)));
    }
  };

  const toggleDeliveryRow = (id: string) => {
    setDeliverySelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isDeliverySelected = (id: string) => deliverySelectedIds.has(id);
  const isDeliveryIndeterminate = deliverySelectedIds.size > 0 && deliverySelectedIds.size < filteredRows.length;

  const handleDeliveryBulkApprove = async (visibleRows: SettlementRow[]) => {
    const ids = Array.from(deliverySelectedIds);
    if (ids.length === 0) return;
    setDeliveryBulkActionPending('approve');
    let successCount = 0;
    let failCount = 0;
    for (const id of ids) {
      const row = visibleRows.find(r => r.id === id);
      if (!row?.sharing) { failCount++; continue; }
      const { error } = await supabase.from('deliveries').update({
        settlement_approved: true,
        settlement_approved_by: user?.id,
      }).eq('id', id);
      if (error) {
        failCount++;
        toast.error(`Failed to approve ${id.slice(0, 8)}: ${error.message}`);
      } else {
        successCount++;
      }
    }
    if (successCount > 0) toast.success(`${successCount} ${successCount === 1 ? 'settlement' : 'settlements'} approved`);
    setDeliverySelectedIds(prev => {
      const next = new Set(prev);
      if (failCount === 0) next.clear();
      return next;
    });
    setDeliveryBulkActionPending(null);
    load();
  };

  // CSV Export handlers
  const handleMerchantExportCsv = () => {
    const columns = [
      { key: 'merchant_name', header: 'Merchant' },
      { key: 'total_deliveries', header: 'Deliveries', format: (v: number) => String(v) },
      { key: 'total_revenue', header: 'Revenue', format: (v: number) => formatMoney(v) },
      { key: 'total_expenses', header: 'Expenses', format: (v: number) => formatMoney(v) },
      { key: 'net_revenue', header: 'Net', format: (v: number) => formatMoney(v) },
      { key: 'merchant_share', header: 'Merchant', format: (v: number) => formatMoney(v) },
      { key: 'rider_share', header: 'Rider', format: (v: number) => formatMoney(v) },
      { key: 'platform_share', header: 'Platform', format: (v: number) => formatMoney(v) },
      { key: 'ucs_share', header: 'UCS Rides', format: (v: number) => formatMoney(v) },
    ];
    const csvRows = buildCsvRows(merchantSummaries, columns);
    downloadCsv(csvRows, generateFilename('settlements-merchants'));
  };

  const handleRiderExportCsv = () => {
    const columns = [
      { key: 'rider_name', header: 'Rider' },
      { key: 'total_deliveries', header: 'Deliveries', format: (v: number) => String(v) },
      { key: 'total_revenue', header: 'Revenue', format: (v: number) => formatMoney(v) },
      { key: 'total_expenses', header: 'Expenses', format: (v: number) => formatMoney(v) },
      { key: 'net_revenue', header: 'Net Revenue', format: (v: number) => formatMoney(v) },
      { key: 'rider_share', header: 'Rider Share', format: (v: number) => formatMoney(v) },
      { key: 'net_payout', header: 'Net Payout', format: (v: number) => formatMoney(v) },
    ];
    const csvRows = buildCsvRows(riderSummaries, columns);
    downloadCsv(csvRows, generateFilename('settlements-riders'));
  };

  const handleDeliveryExportCsv = () => {
    const visibleRows = filteredRows.slice(0, deliveriesVisible);
    const columns = [
      { key: 'order_reference', header: 'Order', format: (v: string | null) => v || '—' },
      { key: 'merchant_name', header: 'Merchant' },
      { key: 'delivered_at', header: 'Delivered', format: (v: string | null) => v ? format(new Date(v), 'yyyy-MM-dd') : '—' },
      { key: 'payment_method', header: 'Payment', format: (v: string | null) => v || '—' },
      { key: 'tariff', header: 'Tariff', format: (v: number) => formatMoney(v) },
      { key: 'netTariff', header: 'Net', format: (v: number) => formatMoney(v) },
      { key: 'rider_share', header: 'Rider', format: (v: number) => formatMoney(v) },
      { key: 'merchant_share', header: 'Merchant', format: (v: number) => formatMoney(v) },
      { key: 'platform_share', header: 'Platform', format: (v: number) => formatMoney(v) },
      { key: 'ucs_rides_share', header: 'UCS', format: (v: number) => formatMoney(v) },
      { key: 'settlement_approved', header: 'Approved', format: (v: boolean) => v ? 'Yes' : 'No' },
    ];
    const rowsWithNet = visibleRows.map(d => ({
      ...d,
      netTariff: getNetTariff(d),
      rider_share: d.sharing ? getNetTariff(d) * d.sharing.rider_percentage / 100 : 0,
      merchant_share: d.sharing ? getNetTariff(d) * d.sharing.merchant_percentage / 100 : 0,
      platform_share: d.sharing ? getNetTariff(d) * d.sharing.platform_percentage / 100 : 0,
      ucs_rides_share: d.sharing ? getNetTariff(d) * d.sharing.ucs_rides_percentage / 100 : 0,
    }));
    const csvRows = buildCsvRows(rowsWithNet, columns);
    downloadCsv(csvRows, generateFilename('settlements-deliveries'));
  };

  const clearSettlementFilters = () => {
    setSettlementSearch('');
    setSettlementStatusFilter([]);
    setSettlementDateFrom('');
    setSettlementDateTo('');
    setSettlementAmountMin('');
    setSettlementAmountMax('');
  };

  // Build a map of per-merchant expense totals for use in individual delivery breakdowns
  const restExpenseMap = new Map<string, number>();
  for (const rs of merchantSummaries) {
    restExpenseMap.set(rs.merchant_id, rs.total_expenses);
  }
  // Per-merchant net revenue for pro-rata individual delivery breakdown
  const restNetRevenueMap = new Map<string, number>();
  for (const rs of merchantSummaries) {
    restNetRevenueMap.set(rs.merchant_id, rs.net_revenue);
  }
  // Per-merchant total revenue for ratio
  const restTotalRevenueMap = new Map<string, number>();
  for (const rs of merchantSummaries) {
    restTotalRevenueMap.set(rs.merchant_id, rs.total_revenue);
  }
  // Calculate effective tariff after pro-rata expense deduction
  const getNetTariff = (d: SettlementRow) => {
    const totalRev = restTotalRevenueMap.get(d.merchant_id) || 1;
    const totalExp = restExpenseMap.get(d.merchant_id) || 0;
    return d.tariff - (d.tariff / totalRev) * totalExp;
  };

  const canApprove = hasRole('accountant') || hasRole('company_manager') || hasRole('admin');

  const totalRevenue = rows.reduce((sum, r) => sum + r.tariff, 0);
  const approvedCount = rows.filter(r => r.settlement_approved).length;

  // Determine default tab based on role
  const defaultTab = (isManagerOnly || isAccountantOnly) ? 'merchants' : 'riders';

  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading settlements" aria-busy="true">
      {[0, 1, 2].map(i => (
        <div key={i} className="shimmer h-28 rounded-md" aria-hidden="true" />
      ))}
      <span className="sr-only">Loading settlements…</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settlements & payouts</h1>
        <p className="text-muted-foreground max-w-2xl">
          {isManagerOnly ? 'Settlements for your merchant.' : isAccountantOnly ? 'Settlements for your assigned merchants.' : 'Auto-calculated from merchant tariffs, sharing ratios and rider expenses.'}
        </p>
      </div>

      {/* Summary cards */}
      <SettlementSummaryCards
        totalDeliveries={rows.length}
        totalRevenue={totalRevenue}
        approvedCount={approvedCount}
        merchantCount={merchantSummaries.length}
      />

      {/* Filter Bar */}
      <Card className="border-muted/50">
        <CardContent className="flex flex-col sm:flex-row gap-3 p-3">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Label htmlFor="settlement-date-from" className="sr-only">Date from</Label>
            <Input id="settlement-date-from" type="date" className="w-36" value={settlementDateFrom} onChange={e => setSettlementDateFrom(e.target.value)} placeholder="From" />
            <Label htmlFor="settlement-date-to" className="sr-only">Date to</Label>
            <Input id="settlement-date-to" type="date" className="w-36" value={settlementDateTo} onChange={e => setSettlementDateTo(e.target.value)} placeholder="To" />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Label htmlFor="settlement-amount-min" className="sr-only">Min amount</Label>
            <Input id="settlement-amount-min" type="number" step="0.01" className="w-28" value={settlementAmountMin} onChange={e => setSettlementAmountMin(e.target.value)} placeholder="Min" />
            <Label htmlFor="settlement-amount-max" className="sr-only">Max amount</Label>
            <Input id="settlement-amount-max" type="number" step="0.01" className="w-28" value={settlementAmountMax} onChange={e => setSettlementAmountMax(e.target.value)} placeholder="Max" />
          </div>
          <div className="relative flex-1 max-w-sm">
            <Label htmlFor="settlement-search" className="sr-only">Search order or merchant</Label>
            <Input id="settlement-search" className="pl-9" placeholder="Search order or merchant..." value={settlementSearch} onChange={e => setSettlementSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="settlement-status">Status</Label>
            <Select value={settlementStatusFilter.join(',')} onValueChange={v => setSettlementStatusFilter(v ? v.split(',') : [])} multiple>
              <SelectTrigger id="settlement-status" className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            {activeTab === 'merchants' && (
              <Button variant="outline" size="sm" onClick={handleMerchantExportCsv} className="gap-1 min-h-[44px]">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />Export CSV
              </Button>
            )}
            {activeTab === 'riders' && (
              <Button variant="outline" size="sm" onClick={handleRiderExportCsv} className="gap-1 min-h-[44px]">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />Export CSV
              </Button>
            )}
            {activeTab === 'deliveries' && (
              <Button variant="outline" size="sm" onClick={handleDeliveryExportCsv} className="gap-1 min-h-[44px]">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />Export CSV
              </Button>
            )}
            {(settlementDateFrom || settlementDateTo || settlementAmountMin || settlementAmountMax || settlementStatusFilter.length > 0 || settlementSearch) && (
              <Button variant="ghost" size="sm" onClick={clearSettlementFilters} className="gap-1 min-h-[44px]">
                <X className="h-3.5 w-3.5" aria-hidden="true" />Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={activeTab} className="w-full" onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="merchants">By Merchant</TabsTrigger>
          {!isManagerOnly && !isAccountantOnly && <TabsTrigger value="riders">By Rider</TabsTrigger>}
          <TabsTrigger value="deliveries">All Deliveries</TabsTrigger>
        </TabsList>

        {/* Merchant Summary Tab */}
        <TabsContent value="merchants" className="space-y-4">
          {merchantSummaries.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Merchant settlements">
                <caption className="sr-only">Per-merchant settlement totals with expandable delivery details</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Deliveries</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Merchant</TableHead>
                    <TableHead className="text-right">Rider</TableHead>
                    <TableHead className="text-right">Platform</TableHead>
                    <TableHead className="text-right">UCS Rides</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchantSummaries.map(rs => (
                    <MerchantSettlementCard
                      key={rs.merchant_id}
                      summary={rs}
                      expenseItems={(restExpenseItemsMap.get(rs.merchant_id) || [])}
                      canApprove={canApprove}
                      onApprove={approveSettlement}
                      paymentLabel={paymentLabel}
                    />
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Totals</TableCell>
                    <TableCell className="tabular-nums">{merchantSummaries.reduce((s, r) => s + r.total_deliveries, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.total_revenue, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.total_expenses, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.net_revenue, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.merchant_share, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.rider_share, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.platform_share, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(merchantSummaries.reduce((s, r) => s + r.ucs_share, 0))}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No merchant settlements to display</p>
            </div>
          )}
        </TabsContent>

        {/* Rider Summary Tab */}
        <TabsContent value="riders" className="space-y-4">
          {riderSummaries.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Rider settlements">
                <caption className="sr-only">Per-rider settlement totals with expandable delivery details</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rider</TableHead>
                    <TableHead>Deliveries</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net revenue</TableHead>
                    <TableHead className="text-right">Rider share</TableHead>
                    <TableHead className="text-right">Net payout</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riderSummaries.map(rs => (
                    <RiderSettlementCard
                      key={rs.rider_id}
                      summary={rs}
                      expenseItems={(riderExpenseItemsMap.get(rs.rider_id) || [])}
                      merchantNameById={merchantNameById}
                      canApprove={canApprove}
                      onApprove={approveSettlement}
                      onIssuePayout={handleIssuePayout}
                      issuing={payingRiderId === rs.rider_id}
                      paymentLabel={paymentLabel}
                      payout={payout}
                    />
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Totals</TableCell>
                    <TableCell className="tabular-nums">{riderSummaries.reduce((s, r) => s + r.total_deliveries, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(riderSummaries.reduce((s, r) => s + r.total_revenue, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(riderSummaries.reduce((s, r) => s + r.total_expenses, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(riderSummaries.reduce((s, r) => s + r.net_revenue, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(riderSummaries.reduce((s, r) => s + r.rider_share, 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(riderSummaries.reduce((s, r) => s + r.net_payout, 0))}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No rider settlements to display</p>
            </div>
          )}
        </TabsContent>

        {/* All Deliveries Tab */}
        <TabsContent value="deliveries" className="space-y-3">
          {filteredRows.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-md border">
                <Table aria-label="All delivery settlements">
                  <caption className="sr-only">Per-delivery settlement rows with payout splits</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        {canApprove && (
                          <Checkbox
                            checked={filteredRows.length > 0 && deliverySelectedIds.size === filteredRows.slice(0, deliveriesVisible).length}
                            indeterminate={deliverySelectedIds.size > 0 && deliverySelectedIds.size < filteredRows.slice(0, deliveriesVisible).length}
                            onCheckedChange={() => toggleDeliverySelectAll(filteredRows.slice(0, deliveriesVisible))}
                            aria-label="Select all visible rows"
                            disabled={filteredRows.length === 0}
                          />
                        )}
                      </TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Route / Delivered</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Tariff</TableHead>
                      <TableHead className="text-right">Expense adj.</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Rider</TableHead>
                      <TableHead className="text-right">Merchant</TableHead>
                      <TableHead className="text-right">Platform</TableHead>
                      <TableHead className="text-right">UCS Rides</TableHead>
                      <TableHead>Ratio / notes</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.slice(0, deliveriesVisible).map(d => {
                      const netTariff = getNetTariff(d);
                      const deduction = d.tariff - netTariff;
                      const hasDeduction = (restExpenseMap.get(d.merchant_id) || 0) > 0;
                      return (
                        <>
                          <DeliverySettlementRow
                            key={d.id}
                            delivery={d}
                            canApprove={canApprove}
                            onApprove={approveSettlement}
                            paymentLabel={paymentLabel}
                            payout={payout}
                            netTariff={netTariff}
                            expenseDeduction={deduction}
                            deliveryExpenses={(deliveryExpenseItemsMap.get(d.id) || [])}
                            hasExpenseDeduction={hasDeduction}
                            selected={deliverySelectedIds.has(d.id)}
                            onSelectChange={(selected) => toggleDeliveryRow(d.id)}
                          />
                        </>
                      );
                    })}
                  </TableBody>
                  {canApprove && deliverySelectedIds.size > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} />
                        <TableCell colSpan={11} className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] gap-1 text-success"
                              onClick={() => handleDeliveryBulkApprove(filteredRows.slice(0, deliveriesVisible))}
                              disabled={deliveryBulkActionPending !== null}
                            >
                              {deliveryBulkActionPending === 'approve' ? 'Approving…' : 'Approve selected'}
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
              {deliveriesVisible < filteredRows.length && (
                <Button variant="outline" className="w-full" onClick={() => setDeliveriesVisible(v => v + DELIVERIES_PAGE_SIZE)}>
                  Show more ({filteredRows.length - deliveriesVisible} remaining)
                </Button>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No delivered orders to settle</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
