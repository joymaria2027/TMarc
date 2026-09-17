import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Receipt, CheckCircle2, DollarSign, User, TrendingDown, Building2, CreditCard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

export default function SettlementsPage() {
  const { user, hasRole } = useAuth();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [riderSummaries, setRiderSummaries] = useState<RiderSummary[]>([]);
  const [merchantSummaries, setMerchantSummaries] = useState<MerchantSummary[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        const riderExpenses = allExpenses.filter((e: any) => e.rider_id === row.rider_id && (e.status === 'approved' || e.status === 'verified'));
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
        const restExpenses = allExpenses.filter((e: any) => e.merchant_id === row.merchant_id && (e.status === 'approved' || e.status === 'verified'));
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
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel('settlements-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_expenses' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'revenue_sharing' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Finance</p>
        <h1 className="font-display text-4xl tracking-tight">Settlements & payouts</h1>
        <p className="text-muted-foreground max-w-2xl">
          {isManagerOnly ? 'Settlements for your merchant.' : isAccountantOnly ? 'Settlements for your assigned merchants.' : 'Auto-calculated from merchant tariffs, sharing ratios and rider expenses.'}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Deliveries</p>
          <p className="font-display text-3xl tabular-nums mt-1">{rows.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Revenue</p>
          <p className="font-display text-3xl tabular-nums mt-1">D{totalRevenue.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Approved</p>
          <p className="font-display text-3xl tabular-nums mt-1 text-accent">{approvedCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Merchants</p>
          <p className="font-display text-3xl tabular-nums mt-1">{merchantSummaries.length}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          <TabsTrigger value="merchants">By Merchant</TabsTrigger>
          {!isManagerOnly && !isAccountantOnly && <TabsTrigger value="riders">By Rider</TabsTrigger>}
          <TabsTrigger value="deliveries">All Deliveries</TabsTrigger>
        </TabsList>

        {/* Merchant Summary Tab */}
        <TabsContent value="merchants" className="space-y-4">
          {merchantSummaries.map(rs => (
            <Card key={rs.merchant_id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold">{rs.merchant_name}</p>
                      <p className="text-xs text-muted-foreground">{rs.total_deliveries} deliveries</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-sm font-semibold">
                    Total: D{rs.total_revenue.toLocaleString()}
                  </Badge>
                </div>

                {/* Expense deduction row */}
                {rs.total_expenses > 0 && (
                  <div className="bg-destructive/10 rounded p-2 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" />Rider Expenses (approved)</span>
                      <span className="font-semibold text-destructive">-D{rs.total_expenses.toLocaleString()}</span>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View expense details</summary>
                      <div className="mt-1 space-y-1">
                        {allExpenses.filter((e: any) => e.merchant_id === rs.merchant_id && (e.status === 'approved' || e.status === 'verified')).map((e: any) => (
                          <div key={e.id} className="flex justify-between py-0.5 border-b border-destructive/10 last:border-0">
                            <span>{e.description}</span>
                            <span className="font-medium text-destructive">-D{Number(e.amount).toFixed(2)}{e.deducted_in_delivery_id ? ' ✓' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                <div className="flex items-center justify-between bg-muted rounded p-2 text-sm">
                  <span className="text-muted-foreground font-medium">Net Revenue (after expenses)</span>
                  <span className="font-bold text-primary">D{rs.net_revenue.toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">Merchant Share</p>
                    <p className="font-semibold text-sm text-primary">D{rs.merchant_share.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">Rider Share</p>
                    <p className="font-semibold text-sm">D{rs.rider_share.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">Platform Share</p>
                    <p className="font-semibold text-sm">D{rs.platform_share.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">UCS Rides</p>
                    <p className="font-semibold text-sm">D{rs.ucs_share.toFixed(2)}</p>
                  </div>
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    View {rs.total_deliveries} delivery details
                  </summary>
                  <div className="mt-2 space-y-2">
                    {rs.deliveries.map(d => (
                      <div key={d.id} className="border rounded p-2 flex items-center justify-between flex-wrap gap-1">
                        <div>
                          <span className="font-medium">{d.order_reference || d.id.slice(0, 8)}</span>
                          {paymentLabel(d) && (
                            <span className="ml-2 text-muted-foreground inline-flex items-center gap-0.5"><CreditCard className="h-3 w-3" />{paymentLabel(d)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>D{d.tariff.toLocaleString()}</span>
                          {d.settlement_approved ? (
                            <CheckCircle2 className="h-3 w-3 text-accent" />
                          ) : (
                            canApprove && d.sharing && (
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => approveSettlement(d.id)}>Approve</Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
          {merchantSummaries.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No merchant settlements to display</p>
            </div>
          )}
        </TabsContent>

        {/* Rider Summary Tab */}
        <TabsContent value="riders" className="space-y-4">
          {riderSummaries.map(rs => (
            <Card key={rs.rider_id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold">{rs.rider_name}</p>
                      <p className="text-xs text-muted-foreground">{rs.total_deliveries} deliveries</p>
                    </div>
                  </div>
                  <Badge variant={rs.net_payout >= 0 ? 'default' : 'destructive'} className="text-sm">
                    Net: D{rs.net_payout.toFixed(2)}
                  </Badge>
                </div>

                {rs.total_expenses > 0 && (
                  <div className="bg-destructive/10 rounded p-2 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" />Approved Expenses</span>
                      <span className="font-semibold text-destructive">-D{rs.total_expenses.toLocaleString()}</span>
                    </div>
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View expense details</summary>
                      <div className="mt-1 space-y-1">
                        {allExpenses.filter((e: any) => e.rider_id === rs.rider_id && (e.status === 'approved' || e.status === 'verified')).map((e: any) => (
                          <div key={e.id} className="flex justify-between py-0.5 border-b border-destructive/10 last:border-0">
                            <span>{e.description} {e.merchant_id ? `(${merchantSummaries.find(r => r.merchant_id === e.merchant_id)?.merchant_name || ''})` : ''}</span>
                            <span className="font-medium text-destructive">-D{Number(e.amount).toFixed(2)}{e.deducted_in_delivery_id ? ' ✓' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                <div className="flex items-center justify-between bg-muted rounded p-2 text-sm">
                  <span className="text-muted-foreground font-medium">Net Revenue (after expenses)</span>
                  <span className="font-bold text-primary">D{rs.net_revenue.toLocaleString()}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">Total Tariffs</p>
                    <p className="font-semibold text-sm">D{rs.total_revenue.toLocaleString()}</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">Rider Share</p>
                    <p className="font-semibold text-sm text-primary">D{rs.rider_share.toFixed(2)}</p>
                  </div>
                  <div className="bg-muted rounded p-2">
                    <p className="text-muted-foreground">Net Payout</p>
                    <p className={`font-semibold text-sm ${rs.net_payout >= 0 ? 'text-accent' : 'text-destructive'}`}>
                      D{rs.net_payout.toFixed(2)}
                    </p>
                  </div>
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                    View {rs.total_deliveries} delivery details
                  </summary>
                  <div className="mt-2 space-y-2">
                    {rs.deliveries.map(d => (
                      <div key={d.id} className="border rounded p-2 flex items-center justify-between flex-wrap gap-1">
                        <div>
                          <span className="font-medium">{d.order_reference || d.id.slice(0, 8)}</span>
                          <span className="text-muted-foreground ml-2">{d.merchant_name}</span>
                          {paymentLabel(d) && (
                            <span className="ml-2 text-muted-foreground inline-flex items-center gap-0.5"><CreditCard className="h-3 w-3" />{paymentLabel(d)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>D{d.tariff.toLocaleString()}</span>
                          {d.sharing && <span className="text-primary">→ D{payout(d.tariff, d.sharing.rider_percentage)}</span>}
                          {d.settlement_approved ? (
                            <CheckCircle2 className="h-3 w-3 text-accent" />
                          ) : (
                            canApprove && d.sharing && (
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => approveSettlement(d.id)}>Approve</Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                {canApprove && (() => {
                  const unapproved = rs.deliveries.filter(d => !d.settlement_approved && d.sharing);
                  const allApproved = unapproved.length === 0;
                  return allApproved ? (
                    <Badge variant="outline" className="text-accent gap-1"><CheckCircle2 className="h-3 w-3" />Payout Issued</Badge>
                  ) : (
                    <Button size="sm" variant="outline" onClick={async () => {
                      const ids = unapproved.map(d => d.id);
                      for (const id of ids) {
                        await supabase.from('deliveries').update({
                          settlement_approved: true,
                          settlement_approved_by: user?.id,
                        }).eq('id', id);
                      }
                      toast.success(`Net payout of D${rs.net_payout.toFixed(2)} issued to ${rs.rider_name} – wallet updated`);
                      load();
                    }}>
                      <DollarSign className="h-3 w-3 mr-1" />Issue Net Payout
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
          {riderSummaries.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No rider settlements to display</p>
            </div>
          )}
        </TabsContent>

        {/* All Deliveries Tab */}
        <TabsContent value="deliveries" className="space-y-3">
          {rows.map(d => (
            <Card key={d.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-sm">{d.order_reference || d.id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">{d.merchant_name}</p>
                    <p className="text-xs text-muted-foreground">{d.pickup_address} → {d.dropoff_address}</p>
                    {d.delivered_at && <p className="text-xs text-muted-foreground">Delivered: {new Date(d.delivered_at).toLocaleString()}</p>}
                    {paymentLabel(d) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" />Payment: {paymentLabel(d)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-semibold">D{d.tariff.toLocaleString()}</Badge>
                    {d.sharing ? (
                      <Badge variant="secondary" className="text-xs">Ratio set</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">No ratio</Badge>
                    )}
                    {d.settlement_approved ? (
                      <Badge className="bg-accent/10 text-accent"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>
                    ) : (
                      canApprove && d.sharing && (
                        <Button size="sm" onClick={() => approveSettlement(d.id)}>Approve</Button>
                      )
                    )}
                  </div>
                </div>

                {d.sharing && (
                  <div className="border-t pt-3">
                    {(restExpenseMap.get(d.merchant_id) || 0) > 0 && (
                      <div className="bg-destructive/10 rounded p-2 mb-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" />Expense deduction</span>
                          <span className="text-destructive font-semibold">-D{(d.tariff - getNetTariff(d)).toFixed(2)}</span>
                        </div>
                        {allExpenses.filter((e: any) => e.deducted_in_delivery_id === d.id).length > 0 && (
                          <div className="text-xs space-y-0.5 pt-1 border-t border-destructive/10">
                            {allExpenses.filter((e: any) => e.deducted_in_delivery_id === d.id).map((e: any) => (
                              <div key={e.id} className="flex justify-between">
                                <span className="text-muted-foreground">{e.description}</span>
                                <span className="text-destructive">-D{Number(e.amount).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> Payout Breakdown (Net D{getNetTariff(d).toFixed(2)})
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-muted rounded p-2">
                        <p className="text-muted-foreground">Rider ({d.sharing.rider_percentage}%)</p>
                        <p className="font-semibold">D{payout(getNetTariff(d), d.sharing.rider_percentage)}</p>
                      </div>
                      <div className="bg-muted rounded p-2">
                        <p className="text-muted-foreground">Merchant ({d.sharing.merchant_percentage}%)</p>
                        <p className="font-semibold">D{payout(getNetTariff(d), d.sharing.merchant_percentage)}</p>
                      </div>
                      <div className="bg-muted rounded p-2">
                        <p className="text-muted-foreground">Platform ({d.sharing.platform_percentage}%)</p>
                        <p className="font-semibold">D{payout(getNetTariff(d), d.sharing.platform_percentage)}</p>
                      </div>
                      <div className="bg-muted rounded p-2">
                        <p className="text-muted-foreground">UCS Rides ({d.sharing.ucs_rides_percentage}%)</p>
                        <p className="font-semibold">D{payout(getNetTariff(d), d.sharing.ucs_rides_percentage)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {!d.sharing && (
                  <p className="text-xs text-muted-foreground border-t pt-2">Set a sharing ratio for {d.merchant_name} in Revenue Sharing to enable auto-calculation</p>
                )}
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && (
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
