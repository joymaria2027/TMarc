import { useEffect, useMemo, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import { pageEmptyStates } from '@/lib/pageEmptyStates';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, PlayCircle, RefreshCw, Search } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface ReportRow {
  order_id: string;
  order_reference: string | null;
  merchant_id: string;
  merchant_name: string | null;
  paid_at: string | null;
  payment_provider: string | null;
  payment_reference: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  expected_credit: number;
  credited_amount: number | null;
  credited_at: string | null;
  status: 'credited' | 'missing' | 'mismatch';
}

interface RunRow {
  id: string;
  range_from: string | null;
  range_to: string | null;
  merchant_id: string | null;
  total_orders: number;
  credited_count: number;
  skipped_count: number;
  failed_count: number;
  credited_amount: number;
  created_at: string;
}

interface ResultRow {
  id: string;
  run_id: string;
  order_reference: string | null;
  outcome: string;
  amount: number;
  detail: string | null;
}

const money = (n: number | null | undefined) => `D ${Number(n ?? 0).toFixed(2)}`;
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

function statusBadge(status: ReportRow['status']) {
  if (status === 'credited') return <Badge className="bg-success/15 text-success border-success/30">Credited</Badge>;
  if (status === 'missing') return <Badge variant="destructive">Missing</Badge>;
  return <Badge className="bg-warning/15 text-warning border-warning/30">Mismatch</Badge>;
}

function outcomeBadge(outcome: string) {
  if (outcome === 'credited') return <Badge className="bg-success/15 text-success border-success/30">Credited</Badge>;
  if (outcome === 'skipped') return <Badge variant="secondary">Already credited</Badge>;
  return <Badge variant="destructive">{outcome}</Badge>;
}

export default function PaymentBackfillPage() {
  const { hasRole } = useAuth();
  const canRun = hasRole('admin') || hasRole('accountant');
  const canView = canRun || hasRole('app_developer') || hasRole('business_owner');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [merchantId, setMerchantId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [merchants, setMerchants] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const params = () => ({
    _from: from ? new Date(from).toISOString() : null,
    _to: to ? new Date(new Date(to).getTime() + 86400000).toISOString() : null,
    _merchant_id: merchantId === 'all' ? null : merchantId,
  });

  const loadReport = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('payment_reconciliation_report', params() as never);
    if (error) toast.error(error.message);
    setRows(((data as unknown as ReportRow[]) || []));
    setLoading(false);
  };

  const loadRuns = async () => {
    const { data } = await supabase
      .from('wallet_backfill_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(25);
    setRuns((data as unknown as RunRow[]) || []);
  };

  const loadResults = async (runId: string) => {
    setActiveRun(runId);
    const { data } = await supabase
      .from('wallet_backfill_results')
      .select('*')
      .eq('run_id', runId)
      .order('created_at');
    setResults((data as unknown as ResultRow[]) || []);
  };

  useEffect(() => {
    supabase.from('merchants').select('id, name').order('name').then(({ data }) => {
      setMerchants((data as { id: string; name: string }[]) || []);
    });
    loadReport();
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = useMemo(() => rows.filter(r => r.status === 'missing'), [rows]);
  const filtered = useMemo(
    () => (statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter)),
    [rows, statusFilter],
  );
  const previewTotal = preview.reduce((s, r) => s + Number(r.expected_credit), 0);

  const runBackfill = async () => {
    if (!preview.length) {
      toast.info('Nothing to backfill in this range');
      return;
    }
    setConfirmOpen(false);
    setRunning(true);
    const { data, error } = await supabase.rpc('run_wallet_backfill', params() as never);
    setRunning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Backfill complete');
    await Promise.all([loadReport(), loadRuns()]);
    if (data) loadResults(data as unknown as string);
  };

  const exportCsv = () => {
    const header = ['Order', 'Merchant', 'Paid at', 'Payment ref', 'Goods subtotal', 'Delivery fee', 'Total', 'Credited', 'Credited at', 'Status'];
    const lines = filtered.map(r => [
      r.order_reference ?? r.order_id,
      r.merchant_name ?? '',
      r.paid_at ?? '',
      r.payment_reference ?? '',
      r.subtotal,
      r.delivery_fee,
      r.total,
      r.credited_amount ?? '',
      r.credited_at ?? '',
      r.status,
    ]);
    const csv = [header, ...lines].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) {
    return <p className="text-muted-foreground">You do not have access to payment backfills.</p>;
  }

  const counts = {
    credited: rows.filter(r => r.status === 'credited').length,
    missing: preview.length,
    mismatch: rows.filter(r => r.status === 'mismatch').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payment Backfill</h1>
        <p className="text-sm text-muted-foreground">
          Check every paid order for its merchant wallet credit (goods subtotal only, delivery fees excluded) and apply missing credits safely.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <Label htmlFor="bf-from" className="text-xs">From</Label>
            <Input id="bf-from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="bf-to" className="text-xs">To</Label>
            <Input id="bf-to" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="bf-merchant" className="text-xs">Merchant</Label>
            <Select value={merchantId} onValueChange={setMerchantId}>
              <SelectTrigger id="bf-merchant"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All merchants</SelectItem>
                {merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="bf-status" className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="bf-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="credited">Credited</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="mismatch">Mismatch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={loadReport} disabled={loading} className="flex-1">
              <Search className="h-4 w-4 mr-2" />Preview
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length} aria-label="Export report as CSV">
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Credited</p><p className="text-2xl font-bold text-success tabular-nums">{counts.credited}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Missing credit</p><p className="text-2xl font-bold text-destructive tabular-nums">{counts.missing}</p><p className="text-xs text-muted-foreground">{money(previewTotal)} outstanding</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Amount mismatch</p><p className="text-2xl font-bold text-warning tabular-nums">{counts.mismatch}</p></CardContent></Card>
      </div>

      {canRun && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {preview.length
                ? `${preview.length} paid order(s) in this range have no merchant credit — ${money(previewTotal)} to apply.`
                : 'Every paid order in this range is already credited.'}
            </p>
            <Button onClick={() => setConfirmOpen(true)} disabled={running || !preview.length}>
              {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4 mr-2" aria-hidden="true" />}
              Run backfill
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run wallet backfill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will credit {preview.length} order(s) totalling {money(previewTotal)} to merchant wallets. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runBackfill}>Credit {money(previewTotal)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Reconciliation report</TabsTrigger>
          <TabsTrigger value="runs">Backfill history</TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Payment ref</TableHead>
                    <TableHead className="text-right">Goods</TableHead>
                    <TableHead className="text-right">Delivery fee</TableHead>
                    <TableHead className="text-right">Credited</TableHead>
                    <TableHead>Credited at</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.order_id}>
                      <TableCell className="font-medium">{r.order_reference ?? r.order_id.slice(0, 8)}</TableCell>
                      <TableCell>{r.merchant_name ?? '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{r.payment_reference ?? '—'}</TableCell>
                      <TableCell className="text-right">{money(r.subtotal)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{money(r.delivery_fee)}</TableCell>
                      <TableCell className="text-right">{r.credited_amount == null ? '—' : money(r.credited_amount)}</TableCell>
                      <TableCell className="text-xs">{when(r.credited_at)}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                  {!filtered.length && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No paid orders match these filters.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Range</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Credited</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map(run => (
                    <TableRow key={run.id}>
                      <TableCell className="text-xs">{when(run.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        {run.range_from ? new Date(run.range_from).toLocaleDateString() : 'start'} →{' '}
                        {run.range_to ? new Date(run.range_to).toLocaleDateString() : 'now'}
                      </TableCell>
                      <TableCell className="text-right">{run.total_orders}</TableCell>
                      <TableCell className="text-right text-success tabular-nums">{run.credited_count}</TableCell>
                      <TableCell className="text-right">{run.skipped_count}</TableCell>
                      <TableCell className="text-right text-destructive">{run.failed_count}</TableCell>
                      <TableCell className="text-right">{money(run.credited_amount)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => loadResults(run.id)}>Details</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!runs.length && (
                    <TableRow><TableCell colSpan={8} className="text-muted-foreground py-4"><EmptyState {...pageEmptyStates.paymentBackfill.list} /></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {activeRun && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Run details</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map(res => (
                      <TableRow key={res.id}>
                        <TableCell className="font-medium">{res.order_reference ?? '—'}</TableCell>
                        <TableCell>{outcomeBadge(res.outcome)}</TableCell>
                        <TableCell className="text-right">{money(res.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{res.detail ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {!results.length && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No orders in this run.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
