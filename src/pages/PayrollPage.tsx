import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Play, Wallet, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { formatMoney, paginate } from '@/lib/finance';

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
  const [profiles, setProfiles] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
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
  const [runForm, setRunForm] = useState({ period_start: monthAgo, period_end: today });
  const [runsPage, setRunsPage] = useState(1);
  const RUNS_PAGE_SIZE = 10;

  const load = async () => {
    const [aRes, rRes, pRes, mRes] = await Promise.all([
      supabase.from('payroll_assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('payroll_runs').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_public_profiles'),
      supabase.from('merchants').select('id, name'),
    ]);
    setAssignments((aRes.data as any[]) || []);
    setRuns((rRes.data as any[]) || []);
    setProfiles((pRes.data as any[]) || []);
    setMerchants(mRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const profileName = (uid: string) => profiles.find(p => p.user_id === uid)?.full_name || profiles.find(p => p.user_id === uid)?.email || uid.slice(0, 8);
  const merchantName = (id: string | null) => id ? merchants.find(m => m.id === id)?.name || id.slice(0, 8) : '—';

  const createAssignment = async () => {
    if (!form.payee_user_id) { setFormError('Pick a payee.'); return; }
    if (form.payer_type === 'merchant' && !form.payer_merchant_id) { setFormError('Pick the paying merchant.'); return; }
    if (form.basis === 'fixed' && (!form.fixed_amount || Number(form.fixed_amount) <= 0)) { setFormError('Enter a fixed amount greater than 0.'); return; }
    if (form.basis === 'percent_of_wallet_income' && (!form.percent || Number(form.percent) <= 0 || Number(form.percent) > 100)) { setFormError('Enter a percent between 0 and 100.'); return; }
    setFormError(null);

    const payload: any = {
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

  const runPayroll = async () => {
    if (!runDialog) return;
    if (!runForm.period_start || !runForm.period_end) { setRunError('Pick a start and end date.'); return; }
    if (runForm.period_start > runForm.period_end) { setRunError('Period start must be before period end.'); return; }
    setRunError(null);
    const { error } = await supabase.rpc('run_payroll', {
      _assignment_id: runDialog.id,
      _period_start: runForm.period_start,
      _period_end: runForm.period_end,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Payroll run completed');
    setRunDialog(null);
    load();
  };

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p: any) => m.set(p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)));
    return m;
  }, [profiles]);
  const merchantMap = useMemo(() => {
    const m = new Map<string, string>();
    merchants.forEach((x: any) => m.set(x.id, x.name));
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
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy={false}>
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
                  <Select value={form.payer_type} onValueChange={v => setForm(p => ({ ...p, payer_type: v as any }))}>
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
                <Select value={form.basis} onValueChange={v => setForm(p => ({ ...p, basis: v as any }))}>
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

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="runs">Run history</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="space-y-3 mt-4">
          {assignments.map(a => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{profileName(a.payee_user_id)}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Paid by <span className="font-medium">{a.payer_type}</span>
                      {a.payer_type === 'merchant' && ` (${merchantName(a.payer_merchant_id)})`}
                      {' • '}
                      {a.basis === 'fixed' ? `Fixed D${a.fixed_amount}` : `${a.percent}% of payer wallet income`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!a.is_active && <Badge variant="secondary">inactive</Badge>}
                    <Button size="sm" onClick={() => setRunDialog(a)} disabled={!a.is_active}>
                      <Play className="h-3 w-3 mr-1" />Run payroll
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {a.notes && <CardContent className="pt-0"><p className="text-xs text-muted-foreground">{a.notes}</p></CardContent>}
            </Card>
          ))}
          {assignments.length === 0 && <div className="text-center py-10 text-muted-foreground"><Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" /><p>No payroll assignments yet</p></div>}
        </TabsContent>

        <TabsContent value="runs" className="space-y-3 mt-4">
          {runs.map(r => {
            const a = assignments.find(x => x.id === r.assignment_id);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{a ? profileName(a.payee_user_id) : r.assignment_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {r.period_start} → {r.period_end}
                      {' • '}{format(new Date(r.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                  <Badge className="bg-success/10 text-success">D{Number(r.computed_amount).toLocaleString()}</Badge>
                </CardContent>
              </Card>
            );
          })}
          {runs.length === 0 && <div className="text-center py-10 text-muted-foreground"><p>No payroll runs yet</p></div>}
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
                <Input id="run-end" type="date" value={runForm.period_end} onChange={e => setRunForm(p => ({ ...p, period_end: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {runDialog?.basis === 'fixed'
                ? `Will pay fixed D${runDialog?.fixed_amount}.`
                : `Will compute ${runDialog?.percent}% of payer wallet credits in this period.`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialog(null)}>Cancel</Button>
            <Button onClick={runPayroll}>Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
