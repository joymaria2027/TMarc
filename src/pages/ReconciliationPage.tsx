import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, Search, CheckCircle2, AlertCircle, Receipt, ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import { format } from 'date-fns';

type Recon = {
  id: string;
  entry_type: 'delivery_payment' | 'payout';
  delivery_id: string | null;
  withdrawal_request_id: string | null;
  amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  party_label: string | null;
  statement_url: string | null;
  status: 'unmatched' | 'matched' | 'disputed';
  notes: string | null;
  occurred_at: string;
  matched_at: string | null;
};

export default function ReconciliationPage() {
  const { hasRole } = useAuth();
  const allowed = hasRole('admin') || hasRole('accountant');
  const [rows, setRows] = useState<Recon[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'delivery_payment' | 'payout'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [notesRow, setNotesRow] = useState<Recon | null>(null);
  const [notesDraft, setNotesDraft] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_reconciliations' as any)
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setRows(((data as any) || []) as Recon[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!allowed) return;
    load();
    const ch = supabase
      .channel('recon-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_reconciliations' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed]);

  const filtered = useMemo(() => rows.filter(r => {
    if (tab !== 'all' && r.entry_type !== tab) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.payment_reference || '').toLowerCase().includes(q)
        || (r.party_label || '').toLowerCase().includes(q)
        || (r.payment_method || '').toLowerCase().includes(q);
    }
    return true;
  }), [rows, tab, statusFilter, search]);

  const totals = useMemo(() => {
    const received = rows.filter(r => r.entry_type === 'delivery_payment').reduce((s, r) => s + Number(r.amount || 0), 0);
    const paidOut = rows.filter(r => r.entry_type === 'payout').reduce((s, r) => s + Number(r.amount || 0), 0);
    const unmatched = rows.filter(r => r.status === 'unmatched').length;
    return { received, paidOut, unmatched, net: received - paidOut };
  }, [rows]);

  const uploadStatement = async (row: Recon, file: File) => {
    const ts = new Date();
    const path = `recon/${ts.getFullYear()}/${String(ts.getMonth() + 1).padStart(2, '0')}/${row.id}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('reconciliation-statements').upload(path, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); return; }
    const { error } = await supabase.from('payment_reconciliations' as any).update({ statement_url: path }).eq('id', row.id);
    if (error) toast.error(error.message); else toast.success('Statement attached');
  };

  const viewStatement = async (path: string) => {
    const { data, error } = await supabase.storage.from('reconciliation-statements').createSignedUrl(path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const setStatus = async (row: Recon, status: Recon['status']) => {
    const { error } = await supabase.from('payment_reconciliations' as any).update({
      status,
      matched_at: status === 'matched' ? new Date().toISOString() : null,
    }).eq('id', row.id);
    if (error) toast.error(error.message);
    else toast.success(`Marked ${status}`);
  };

  const saveNotes = async () => {
    if (!notesRow) return;
    const { error } = await supabase.from('payment_reconciliations' as any).update({ notes: notesDraft }).eq('id', notesRow.id);
    if (error) toast.error(error.message); else toast.success('Notes saved');
    setNotesRow(null);
  };

  if (!allowed) return <div className="p-6 text-muted-foreground">You do not have access to reconciliation.</div>;
  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const statusBadge = (s: Recon['status']) => {
    const map: Record<string, string> = {
      unmatched: 'bg-warning/10 text-warning border-warning/20',
      matched: 'bg-accent/10 text-accent border-accent/20',
      disputed: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return <Badge variant="outline" className={map[s]}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reconciliation</h1>
        <p className="text-muted-foreground">Match delivery payments and payouts against bank statements.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <ArrowDownCircle className="h-8 w-8 text-accent" />
          <div><p className="text-xs text-muted-foreground">Received</p><p className="text-lg font-semibold">D{totals.received.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <ArrowUpCircle className="h-8 w-8 text-primary" />
          <div><p className="text-xs text-muted-foreground">Paid Out</p><p className="text-lg font-semibold">D{totals.paidOut.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Scale className="h-8 w-8 text-info" />
          <div><p className="text-xs text-muted-foreground">Net</p><p className="text-lg font-semibold">D{totals.net.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="h-8 w-8 text-warning" />
          <div><p className="text-xs text-muted-foreground">Unmatched</p><p className="text-lg font-semibold">{totals.unmatched}</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search reference, party, method..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
          <TabsTrigger value="delivery_payment"><Receipt className="h-3.5 w-3.5 mr-1" />Payments Received</TabsTrigger>
          <TabsTrigger value="payout"><ArrowUpCircle className="h-3.5 w-3.5 mr-1" />Payouts Issued</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Statement</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{format(new Date(r.occurred_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        {r.entry_type === 'delivery_payment'
                          ? <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">In</Badge>
                          : <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Out</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.payment_reference || '—'}</TableCell>
                      <TableCell className="text-sm">{r.party_label || '—'}</TableCell>
                      <TableCell className="text-xs">{r.payment_method || '—'}</TableCell>
                      <TableCell className="text-right font-medium">D{Number(r.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        {r.statement_url ? (
                          <Button variant="ghost" size="sm" onClick={() => viewStatement(r.statement_url!)}>
                            <FileText className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                        ) : (
                          <label className="inline-flex items-center text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                            <Upload className="h-3.5 w-3.5 mr-1" />Upload
                            <input type="file" className="hidden" onChange={e => e.target.files?.[0] && uploadStatement(r, e.target.files[0])} />
                          </label>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status !== 'matched' && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'matched')} title="Mark matched">
                              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                            </Button>
                          )}
                          {r.status !== 'disputed' && (
                            <Button size="sm" variant="ghost" onClick={() => setStatus(r, 'disputed')} title="Mark disputed">
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { setNotesRow(r); setNotesDraft(r.notes || ''); }} title="Notes">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No reconciliation entries.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!notesRow} onOpenChange={(o) => !o && setNotesRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reconciliation notes</DialogTitle></DialogHeader>
          <Textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={5} placeholder="Bank ref, discrepancy reason, etc." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesRow(null)}>Cancel</Button>
            <Button onClick={saveNotes}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
