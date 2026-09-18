import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/finance';
import { Plus, Play, Wallet, CheckCircle2, Download, X, Search } from 'lucide-react';
import { format } from 'date-fns';
import { formatMoney, paginate } from '@/lib/finance';
import { validateRunPeriod } from '@/lib/moneyGuards';
import { buildCsvRows, downloadCsv, generateFilename } from '@/lib/financeExport';

interface Assignment {
  id: string;
  payee_user_id: string;
  payer_type: 'merchant' | 'business_owner' | 'platform';
  payer_merchant_id: string | null;
  basis: 'fixed' | 'percent_of_wallet_income';
  fixed_amount: number | null;
  percent: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}
interface Run {
  id: string; assignment_id: string; period_start: string; period_end: string;
  computed_amount: number; status: string; created_at: string;
}

export default function PayrollPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [profiles, setProfiles] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [merchants, setMerchants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [runDialog, setRunDialog] = useState<Assignment | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    payee_user_id: '', payer_type: 'merchant', payer_merchant_id: '',
    basis: 'fixed', fixed_amount: '', percent: '', notes: '', is_active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runForm, setRunForm] = useState({ period_start: monthAgo, period_end: today });
  const [runsPage, setRunsPage] = useState(1);
  const RUNS_PAGE_SIZE = 10;

  // Filters for assignments
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<string[]>([]);
  const [assignmentPayerFilter, setAssignmentPayerFilter] = useState<string[]>([]);

  // Filters for runs
  const [runSearch, setRunSearch] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<string[]>([]);

  // Bulk selection
  const [assignmentSelectedIds, setAssignmentSelectedIds] = useState<Set<string>>(new Set());
  const [runSelectedIds, setRunSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [aRes, rRes, pRes, mRes] = await Promise.all([
      supabase.from('payroll_assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('payroll_runs').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_public_profiles'),
      supabase.from('merchants').select('id, name'),
    ]);
    setAssignments((aRes.data as Assignment[]) || []);
    setRuns((rRes.data as Run[]) || []);
    setProfiles((pRes.data as { user_id: string; full_name: string | null; email: string | null }[]) || []);
    setMerchants(mRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const profileName = (uid: string) => profiles.find(p => p.user_id === uid)?.full_name || profiles.find(p => p.user_id === uid)?.email || uid.slice(0, 8);
  const merchantName = (id: string | null) => id ? merchants.find(m => m.id === id)?.name || id.slice(0, 8) : '—';

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter(a => {
      if (assignmentSearch) {
        const q = assignmentSearch.toLowerCase();
        const payeeName = profileName(a.payee_user_id).toLowerCase();
        const payerMerchantName = a.payer_merchant_id ? merchantName(a.payer_merchant_id).toLowerCase() : '';
        return payeeName.includes(q) || payerMerchantName.includes(q) || a.payer_type.toLowerCase().includes(q);
      }
      if (assignmentStatusFilter.length > 0) {
        const isActive = a.is_active ? 'active' : 'inactive';
        if (!assignmentStatusFilter.includes(isActive)) return false;
      }
      if (assignmentPayerFilter.length > 0) {
        if (!assignmentPayerFilter.includes(a.payer_type)) return false;
      }
      return true;
    });
  }, [assignments, assignmentSearch, assignmentStatusFilter, assignmentPayerFilter, profiles, merchants]);

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return runs.filter(r => {
      if (runSearch) {
        const q = runSearch.toLowerCase();
        const a = assignments.find(x => x.id === r.assignment_id);
        const payeeName = a ? profileName(a.payee_user_id).toLowerCase() : '';
        return payeeName.includes(q) || r.assignment_id.slice(0, 8).includes(q);
      }
      if (runStatusFilter.length > 0) {
        if (!runStatusFilter.includes(r.status)) return false;
      }
      return true;
    });
  }, [runs, runSearch, runStatusFilter, assignments, profiles]);

  // Bulk selection handlers for assignments
  const toggleAssignmentSelectAll = () => {
    if (assignmentSelectedIds.size === filteredAssignments.length) {
      setAssignmentSelectedIds(new Set());
    } else {
      setAssignmentSelectedIds(new Set(filteredAssignments.map(a => a.id)));
    }
  };

  const toggleAssignmentRow = (id: string) => {
    setAssignmentSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAssignmentSelected = (id: string) => assignmentSelectedIds.has(id);
  const isAssignmentIndeterminate = assignmentSelectedIds.size > 0 && assignmentSelectedIds.size < filteredAssignments.length;

  // Bulk selection handlers for runs
  const toggleRunSelectAll = () => {
    if (runSelectedIds.size === filteredRuns.length) {
      setRunSelectedIds(new Set());
    } else {
      setRunSelectedIds(new Set(filteredRuns.map(r => r.id)));
    }
  };

  const toggleRunRow = (id: string) => {
    setRunSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRunSelected = (id: string) => runSelectedIds.has(id);
  const isRunIndeterminate = runSelectedIds.size > 0 && runSelectedIds.size < filteredRuns.length;

  // CSV Export for assignments
  const handleAssignmentExportCsv = () => {
    const columns = [
      { key: 'payee_user_id', header: 'Payee', format: (v: string) => profileName(v) },
      { key: 'payer_type', header: 'Payer' },
      { key: 'payer_merchant_id', header: 'Merchant', format: (v: string | null) => v ? merchantName(v) : '—' },
      { key: 'basis', header: 'Basis', format: (v: string) => v === 'fixed' ? 'Fixed' : '% of payer wallet income' },
      { key: 'fixed_amount', header: 'Fixed Amount', format: (v: number | null) => v !== null ? formatMoney(v) : '—' },
      { key: 'percent', header: 'Percent (%)', format: (v: number | null) => v !== null ? `${v}%` : '—' },
      { key: 'is_active', header: 'Status', format: (v: boolean) => v ? 'Active' : 'Inactive' },
      { key: 'notes', header: 'Notes', format: (v: string | null) => v || '—' },
    ];
    const csvRows = buildCsvRows(filteredAssignments, columns);
    downloadCsv(csvRows, generateFilename('payroll-assignments'));
  };

  // CSV Export for runs
  const handleRunExportCsv = () => {
    const columns = [
      { key: 'assignment_id', header: 'Payee', format: (v: string) => {
        const a = assignments.find(x => x.id === v);
        return a ? profileName(a.payee_user_id) : v.slice(0, 8);
      }},
      { key: 'period_start', header: 'Period Start' },
      { key: 'period_end', header: 'Period End' },
      { key: 'created_at', header: 'Run At', format: (v: string) => format(new Date(v), 'yyyy-MM-dd HH:mm') },
      { key: 'computed_amount', header: 'Computed Amount', format: (v: number) => formatMoney(v) },
      { key: 'status', header: 'Status' },
    ];
    const csvRows = buildCsvRows(filteredRuns, columns);
    downloadCsv(csvRows, generateFilename('payroll-runs'));
  };

  const clearAssignmentFilters = () => {
    setAssignmentSearch('');
    setAssignmentStatusFilter([]);
    setAssignmentPayerFilter([]);
  };

  const clearRunFilters = () => {
    setRunSearch('');
    setRunStatusFilter([]);
  };

  const createAssignment = async () => {
    if (!form.payee_user_id) { setFormError('Pick a payee.'); return; }
    if (form.payer_type === 'merchant' && !form.payer_merchant_id) { setFormError('Pick the paying merchant.'); return; }
    if (form.basis === 'fixed' && (!form.fixed_amount || Number(form.fixed_amount) <= 0)) { setFormError('Enter a fixed amount greater than 0.'); return; }
    if (form.basis === 'percent_of_wallet_income' && (!form.percent || Number(form.percent) <= 0 || Number(form.percent) > 100)) { setFormError('Enter a percent between 0 and 100.'); return; }
    setFormError(null);

    const payload: Record<string, unknown> = {
      payee_user_id: form.payee_user_id,
      payer_type: form.payer_type,
      payer_merchant_id: form.payer_type === 'merchant' ? form.payer_merchant_id : null,
      basis: form.basis,
      fixed_amount: form.basis === 'fixed' ? parseFloat(form.fixed_amount) : null,
      percent: form.basis === 'percent_of_wallet_income' ? parseFloat(form.percent) : null,
      notes: form.notes || null,
      is_active: form.is_active,
      created_by: user!.id,
    };
    const { error } = await supabase.from('payroll_assignments').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Payroll assignment created');
    setOpen(false);
    setForm({ payee_user_id: '', payer_type: 'merchant', payer_merchant_id: '', basis: 'fixed', fixed_amount: '', percent: '', notes: '', is_active: true });
    load();
  };

  const runPreview = () => {
    if (!runDialog) return null;
    if (runDialog.basis === 'fixed') {
      return formatMoney(Number(runDialog.fixed_amount ?? 0));
    }
    return null; // percent basis: amount is computed server-side at run time
  };

  const runPayroll = async () => {
    if (!runDialog || running) return;
    const periodError = validateRunPeriod(runForm.period_start, runForm.period_end);
    if (periodError) { setRunError(periodError); return; }
    setRunError(null);
    setRunning(true);
    try {
      const { error } = await supabase.rpc('run_payroll', {
        _assignment_id: runDialog.id,
        _period_start: runForm.period_start,
        _period_end: runForm.period_end,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Payroll run completed');
      setRunDialog(null);
      load();
    } finally {
      setRunning(false);
    }
  };

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: { user_id: string; full_name: string | null; email: string | null }) => m.set(p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)));
    return m;
  }, [profiles]);
  const merchantMap = useMemo(() => {
    const m = new Map<string, string>();
    merchants.forEach((x: { id: string; name: string }) => m.set(x.id, x.name));
    return m;
  }, [merchants]);
  const runsPaged = useMemo(() => paginate(runs, runsPage, RUNS_PAGE_SIZE), [runs, runsPage]);

  if (!isAdmin) {
    return <div className="text-center py-20 text-muted-foreground">Admin only.</div>;
  }
  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading payroll">
      <div className="shimmer h-16 rounded-md" aria-hidden="true" />
      <div className="shimmer h-32 rounded-md" aria-hidden="true" />
      <span className="sr-only">Loading payroll…</span>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy={loading}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground">Assign salaries to accountants, business owners and staff. Paid from merchant, business owner, or platform wallets.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New assignment</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New payroll assignment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pay-payee">Payee (user) *</Label>
                <Select value={form.payee_user_id} onValueChange={v => { setForm(p => ({ ...p, payee_user_id: v })); setFormError(null); }}>
                  <SelectTrigger id="pay-payee" aria-describedby={formError ? 'pay-form-error' : undefined}><SelectValue placeholder="Select user" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.user_id} value={p.user_id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pay-payer">Paid by</Label>
                  <Select value={form.payer_type} onValueChange={v => setForm(p => ({ ...p, payer_type: v as 'merchant' | 'business_owner' | 'platform' }))}>
                    <SelectTrigger id="pay-payer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merchant">Merchant</SelectItem>
                      <SelectItem value="business_owner">Business owner</SelectItem>
                      <SelectItem value="platform">Platform</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.payer_type === 'merchant' && (
                  <div className="space-y-2">
                    <Label htmlFor="pay-merchant">Merchant *</Label>
                    <Select value={form.payer_merchant_id} onValueChange={v => { setForm(p => ({ ...p, payer_merchant_id: v })); setFormError(null); }}>
                      <SelectTrigger id="pay-merchant" aria-describedby={formError ? 'pay-form-error' : undefined}><SelectValue placeholder="Merchant" /></SelectTrigger>
                      <SelectContent>
                        {merchants.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-basis">Basis</Label>
                <Select value={form.basis} onValueChange={v => setForm(p => ({ ...p, basis: v as 'fixed' | 'percent_of_wallet_income' }))}>
                  <SelectTrigger id="pay-basis"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                    <SelectItem value="percent_of_wallet_income">Percent of payer wallet income (period)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.basis === 'fixed' ? (
                <div className="space-y-2">
                  <Label htmlFor="pay-fixed">Fixed amount (D)</Label>
                  <Input id="pay-fixed" type="number" min="0" step="0.01" value={form.fixed_amount} onChange={e => { setForm(p => ({ ...p, fixed_amount: e.target.value })); setFormError(null); }} aria-invalid={!!formError} aria-describedby={formError ? 'pay-form-error' : undefined} className="tabular-nums" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pay-percent">Percent (%)</Label>
                  <Input id="pay-percent" type="number" min="0" max="100" step="0.01" value={form.percent} onChange={e => { setForm(p => ({ ...p, percent: e.target.value })); setFormError(null); }} aria-invalid={!!formError} aria-describedby={formError ? 'pay-form-error' : undefined} className="tabular-nums" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="pay-notes">Notes</Label>
                <Input id="pay-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              {formError && <p id="pay-form-error" role="alert" className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createAssignment}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter Bar for Assignments */}
      <Card className="border-muted/50">
        <CardContent className="flex flex-col sm:flex-row gap-3 p-3">
          <div className="relative flex-1 max-w-sm">
            <Label htmlFor="assignment-search" className="sr-only">Search payee or merchant</Label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input id="assignment-search" className="pl-9" placeholder="Search payee or merchant..." value={assignmentSearch} onChange={e => setAssignmentSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="assignment-status">Status</Label>
            <Select value={assignmentStatusFilter.join(',')} onValueChange={v => setAssignmentStatusFilter(v ? v.split(',') : [])} multiple>
              <SelectTrigger id="assignment-status" className="w-36"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="assignment-payer">Payer</Label>
            <Select value={assignmentPayerFilter.join(',')} onValueChange={v => setAssignmentPayerFilter(v ? v.split(',') : [])} multiple>
              <SelectTrigger id="assignment-payer" className="w-36"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="merchant">Merchant</SelectItem>
                <SelectItem value="business_owner">Business Owner</SelectItem>
                <SelectItem value="platform">Platform</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={handleAssignmentExportCsv} className="gap-1 min-h-[44px]">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />Export CSV
            </Button>
            {(assignmentSearch || assignmentStatusFilter.length > 0 || assignmentPayerFilter.length > 0) && (
              <Button variant="ghost" size="sm" onClick={clearAssignmentFilters} className="gap-1 min-h-[44px]">
                <X className="h-3.5 w-3.5" aria-hidden="true" />Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="runs">Run history</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-3 mt-4">
          {filteredAssignments.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Payroll assignments">
                <caption className="sr-only">Payroll assignments with payer, basis, amount, status and run actions</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={filteredAssignments.length > 0 && assignmentSelectedIds.size === filteredAssignments.length}
                        indeterminate={isAssignmentIndeterminate}
                        onCheckedChange={toggleAssignmentSelectAll}
                        aria-label="Select all visible rows"
                        disabled={filteredAssignments.length === 0}
                      />
                    </TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="w-12">
                        <Checkbox
                          checked={isAssignmentSelected(a.id)}
                          onCheckedChange={() => toggleAssignmentRow(a.id)}
                          aria-label={`Select assignment for ${profileName(a.payee_user_id)}`}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{profileName(a.payee_user_id)}</span>
                        {a.notes && <span className="block text-xs text-muted-foreground">{a.notes}</span>}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{a.payer_type}</span>
                        {a.payer_type === 'merchant' && <span className="block text-xs text-muted-foreground">{merchantName(a.payer_merchant_id)}</span>}
                      </TableCell>
                      <TableCell>{a.basis === 'fixed' ? 'Fixed' : '% of payer wallet income'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {a.basis === 'fixed' ? formatMoney(Number(a.fixed_amount)) : `${a.percent}% of payer wallet income`}
                      </TableCell>
                      <TableCell>
                        {a.is_active ? (
                          <Badge className="gap-1 bg-success/10 text-success"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Active</Badge>
                        ) : (
                          <Badge variant="secondary">inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" className="min-h-[44px]" onClick={() => setRunDialog(a)} disabled={!a.is_active}>
                          <Play className="h-3 w-3 mr-1" aria-hidden="true" />Run payroll
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground"><Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No payroll assignments yet</p></div>
          )}
        </TabsContent>

        <TabsContent value="runs" className="space-y-3 mt-4">
          {/* Filter Bar for Runs */}
          <Card className="border-muted/50">
            <CardContent className="flex flex-col sm:flex-row gap-3 p-3">
              <div className="relative flex-1 max-w-sm">
                <Label htmlFor="run-search" className="sr-only">Search payee</Label>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input id="run-search" className="pl-9" placeholder="Search payee..." value={runSearch} onChange={e => setRunSearch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="run-status">Status</Label>
                <Select value={runStatusFilter.join(',')} onValueChange={v => setRunStatusFilter(v ? v.split(',') : [])} multiple>
                  <SelectTrigger id="run-status" className="w-36"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm" onClick={handleRunExportCsv} className="gap-1 min-h-[44px]">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />Export CSV
                </Button>
                {(runSearch || runStatusFilter.length > 0) && (
                  <Button variant="ghost" size="sm" onClick={clearRunFilters} className="gap-1 min-h-[44px]">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />Clear all
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {filteredRuns.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Payroll run history">
                <caption className="sr-only">Payroll run history with period, computed amount and status</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={filteredRuns.length > 0 && runSelectedIds.size === filteredRuns.length}
                        indeterminate={isRunIndeterminate}
                        onCheckedChange={toggleRunSelectAll}
                        aria-label="Select all visible rows"
                        disabled={filteredRuns.length === 0}
                      />
                    </TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Run at</TableHead>
                    <TableHead className="text-right">Computed amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRuns.map(r => {
                    const a = assignments.find(x => x.id === r.assignment_id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="w-12">
                          <Checkbox
                            checked={isRunSelected(r.id)}
                            onCheckedChange={() => toggleRunRow(r.id)}
                            aria-label={`Select run for ${a ? profileName(a.payee_user_id) : r.assignment_id.slice(0, 8)}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{a ? profileName(a.payee_user_id) : r.assignment_id.slice(0, 8)}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          <time dateTime={r.period_start}>{r.period_start}</time>
                          {' → '}
                          <time dateTime={r.period_end}>{r.period_end}</time>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          <time dateTime={r.created_at}>{format(new Date(r.created_at), 'MMM d, yyyy HH:mm')}</time>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Badge variant="secondary" className="gap-1 tabular-nums"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />{formatMoney(Number(r.computed_amount))}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.status}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            runs.length === 0 && <div className="text-center py-10 text-muted-foreground"><p>No payroll runs yet</p></div>
          )}
          {filteredRuns.length > 0 && filteredRuns.length > runsPaged.paged.length && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground" role="status">Page {runsPaged.page} of {runsPaged.totalPages} · {runsPaged.total} runs</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={runsPaged.page <= 1} aria-label="Previous runs page" onClick={() => setRunsPage(p => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={runsPaged.page >= runsPaged.totalPages} aria-label="Next runs page" onClick={() => setRunsPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!runDialog} onOpenChange={(o) => !o && setRunDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Run payroll — {runDialog && profileName(runDialog.payee_user_id)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="run-start">Period start</Label>
                <Input id="run-start" type="date" value={runForm.period_start} onChange={e => setRunForm(p => ({ ...p, period_start: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-end">Period end</Label>
                <Input id="run-end" type="date" max={today} value={runForm.period_end} onChange={e => setRunForm(p => ({ ...p, period_end: e.target.value }))} />
              </div>
            </div>
            {runDialog?.basis === 'fixed' ? (
              <p className="text-sm" role="status">
                This run pays <span className="font-semibold tabular-nums">{formatMoney(Number(runDialog?.fixed_amount ?? 0))}</span> for
                {' '}{runDialog && profileName(runDialog.payee_user_id)}.
              </p>
            ) : (
              <p className="text-sm" role="status">
                This run computes <span className="font-semibold tabular-nums">{runDialog?.percent}%</span> of the payer's wallet
                credits between <time dateTime={runForm.period_start}>{runForm.period_start}</time> and{' '}<time dateTime={runForm.period_end}>{runForm.period_end}</time>.
                The exact amount is calculated at run time.
              </p>
            )}
            {runError && <p role="alert" className="text-sm text-destructive">{runError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialog(null)}>Cancel</Button>
            <Button onClick={runPayroll} disabled={running}>
              {running ? 'Running…' : runDialog?.basis === 'fixed' ? `Run payroll — pay ${runPreview()}` : 'Run payroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
