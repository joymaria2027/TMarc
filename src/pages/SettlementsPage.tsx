import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SettlementSummaryCards from '@/components/settlements/SettlementSummaryCards';
import MerchantSettlementCard from '@/components/settlements/MerchantSettlementCard';
import RiderSettlementCard from '@/components/settlements/RiderSettlementCard';
import DeliverySettlementRow from '@/components/settlements/DeliverySettlementRow';
import { partitionPayoutDeliveries, summarizeBulkResult } from '@/lib/moneyGuards';
import { formatMoney } from '@/lib/finance';

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

export default function SettlementsPage() {
  const { user, hasRole } = useAuth();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [deliveriesVisible, setDeliveriesVisible] = useState(DELIVERIES_PAGE_SIZE);
  const [riderSummaries, setRiderSummaries] = useState<RiderSummary[]>([]);
  const [merchantSummaries, setMerchantSummaries] = useState<MerchantSummary[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [restExpenseItemsMap, setRestExpenseItemsMap] = useState<Map<string, any[]>>(new Map());
  const [riderExpenseItemsMap, setRiderExpenseItemsMap] = useState<Map<string, any[]>>(new Map());
  const [deliveryExpenseItemsMap, setDeliveryExpenseItemsMap] = useState<Map<string, any[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [payingRiderId, setPayingRiderId] = useState<string | null>(null);

  const isAdmin = hasRole('admin');
  const isRiderOnly = hasRole('rider') && !isAdmin && !hasRole('accountant') && !hasRole('business_owner') && !hasRole('company_manager');
  const isManagerOnly = hasRole('company_manager') && !isAdmin;
  const isAccountantOnly = hasRole('accountant') && !isAdmin;

  const load = async () => {
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

    const [delsRes, sharesRes, tariffsRes, restsRes, ridersRes, profilesRes, expensesRes] = await Promise.all([
      delsQuery,
      supabase.from('revenue_sharing').select('*'),
      supabase.from('merchant_tariffs').select('*'),
      supabase.from('merchants').select('id, name'),
      supabase.from('riders').select('id, user_id'),
      supabase.from('profiles').select('user_id, full_name'),
      isRiderOnly && myRiderId
        ? supabase.from('rider_expenses').select('*').eq('rider_id', myRiderId)
        : supabase.from('rider_expenses').select('*'),
    ]);

    const dels = delsRes.data || [];
    const shares = sharesRes.data || [];
    const tariffs = tariffsRes.data || [];
    const rests = restsRes.data || [];
    const riders = ridersRes.data || [];
    const profiles = profilesRes.data || [];
    const expenses = expensesRes.data || [];
    setAllExpenses(expenses);

    const merged: SettlementRow[] = dels.map(d => {
      const s = shares.find((sh: any) => sh.merchant_id === d.merchant_id);
      const restTariffs = tariffs.filter((t: any) => t.merchant_id === d.merchant_id);
      const bestTariff = restTariffs.length > 0
        ? Math.max(...restTariffs.map((t: any) => Number(t.tariff_amount)))
        : 0;
      const rest = rests.find((r: any) => r.id === d.merchant_id);
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
        payment_method: (d as any).payment_method || null,
        payment_bank_name: (d as any).payment_bank_name || null,
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
        const rider = riders.find((r: any) => r.id === row.rider_id);
        const profile = rider ? profiles.find((p: any) => p.user_id === rider.user_id) : null;
        const riderExpenses = expenses.filter((e: any) => e.rider_id === row.rider_id && (e.status === 'approved' || e.status === 'verified'));
        const totalExpenses = riderExpenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);

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
        const restExpenses = expenses.filter((e: any) => e.merchant_id === row.merchant_id && (e.status === 'approved' || e.status === 'verified'));
        const totalRestExpenses = restExpenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);

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
    const restItemsMap = new Map<string, any[]>();
    for (const rs of restMap.values()) {
      const items = expenses.filter((e: any) => e.merchant_id === rs.merchant_id && (e.status === 'approved' || e.status === 'verified'));
      restItemsMap.set(rs.merchant_id, items);
    }
    const riderItemsMap = new Map<string, any[]>();
    for (const rs of riderMap.values()) {
      const items = expenses.filter((e: any) => e.rider_id === rs.rider_id && (e.status === 'approved' || e.status === 'verified'));
      riderItemsMap.set(rs.rider_id, items);
    }
    const deliveryItemsMap = new Map<string, any[]>();
    for (const row of merged) {
      const items = expenses.filter((e: any) => e.deducted_in_delivery_id === row.id);
      if (items.length > 0) deliveryItemsMap.set(row.id, items);
    }
    setRestExpenseItemsMap(restItemsMap);
    setRiderExpenseItemsMap(riderItemsMap);
    setDeliveryExpenseItemsMap(deliveryItemsMap);
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
      .channel('settlements-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_expenses' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => scheduleReload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => scheduleReload())
      .subscribe();
    return () => { if (reloadTimer) clearTimeout(reloadTimer); supabase.removeChannel(channel); };
  }, []);

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

      <Tabs defaultValue={defaultTab} className="w-full">
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
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="All delivery settlements">
                <caption className="sr-only">Per-delivery settlement rows with payout splits</caption>
                <TableHeader>
                  <TableRow>
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
                  {rows.slice(0, deliveriesVisible).map(d => {
                    const netTariff = getNetTariff(d);
                    const deduction = d.tariff - netTariff;
                    const hasDeduction = (restExpenseMap.get(d.merchant_id) || 0) > 0;
                    return (
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
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No delivered orders to settle</p>
            </div>
          )}
          {deliveriesVisible < rows.length && (
            <Button variant="outline" className="w-full" onClick={() => setDeliveriesVisible(v => v + DELIVERIES_PAGE_SIZE)}>
              Show more ({rows.length - deliveriesVisible} remaining)
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
