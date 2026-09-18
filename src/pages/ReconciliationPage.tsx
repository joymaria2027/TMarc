import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, Search, CheckCircle2, AlertCircle, Receipt, ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { formatMoney } from '@/lib/finance';

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
  const [actionRow, setActionRow] = useState<{ row: Recon; action: 'matched' | 'disputed' } | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 600);
  }, [load]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_reconciliations')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setRows((data || []) as Recon[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    load();
    const ch = supabase
      .channel('recon-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_reconciliations' }, () => scheduleReload())
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(ch);
    };
  }, [allowed, load, scheduleReload]);

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
    const { error } = await supabase.from('payment_reconciliations').update({ statement_url: path }).eq('id', row.id);
    if (error) toast.error(error.message); else toast.success('Statement attached');
  };

  const viewStatement = async (path: string) => {
    const { data, error } = await supabase.storage.from('reconciliation-statements').createSignedUrl(path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const setStatus = async (row: Recon, status: Recon['status']) => {
    const { error } = await supabase.from('payment_reconciliations').update({
      status,
      matched_at: status === 'matched' ? new Date().toISOString() : null,
    }).eq('id', row.id);
    if (error) toast.error(error.message);
    else toast.success(`Marked ${status}`);
    setActionRow(null);
  };

  const saveNotes = async () => {
    if (!notesRow) return;
    const { error } = await supabase.from('payment_reconciliations').update({ notes: notesDraft }).eq('id', notesRow.id);
    if (error) toast.error(error.message); else toast.success('Notes saved');
    setNotesRow(null);
  };

  if (!allowed) return <div className="p-6 text-muted-foreground">You do not have access to reconciliation.</div>;
  if (loading) return (
    <div className="space-y-4" role="status" aria-label="Loading reconciliation">
      <div className="shimmer h-20 rounded-md" aria-hidden="true" />
      <div className="shimmer h-64 rounded-md" aria-hidden="true" />
      <span className="sr-only">Loading reconciliation…</span>
    </div>
  );

  const statusBadge = (s: Recon['status']) => {
    const map: Record<string, string> = {
      unmatched: 'bg-warning/10 text-warning border-warning/20',
      matched: 'bg-accent/10 text-accent border-accent/20',
      disputed: 'bg-destructive/10 text-destructive border-destructive/20',
    };
    return <Badge variant="outline" className={map[s]}>{s}</Badge>;
  };

  return (
    <div className="space-y-6" aria-busy={loading}>
      <div>
        <h1 className="text-2xl font-bold">Reconciliation</h1>
        <p className="text-muted-foreground">Match delivery payments and payouts against bank statements.</p>
      </div>

      {/* Compact totals strip (lane-04: data-true but not hero tiles) */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5"><ArrowDownCircle className="h-4 w-4 text-accent" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totals.received)}</strong>&nbsp;received</span>
          <span className="flex items-center gap-1.5"><ArrowUpCircle className="h-4 w-4 text-primary" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totals.paidOut)}</strong>&nbsp;paid out</span>
          <span className="flex items-center gap-1.5"><Scale className="h-4 w-4 text-info" aria-hidden="true" /><strong className="tabular-nums">{formatMoney(totals.net)}</strong>&nbsp;net</span>
          <span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-warning" aria-hidden="true" /><strong className="tabular-nums">{totals.unmatched}</strong>&nbsp;unmatched</span>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Showing latest {rows.length} of up to 1000 entries. Refine search or status to narrow results.</p>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="relative flex-1 max-w-sm">
          <Label htmlFor="recon-search" className="sr-only">Search reconciliation entries</Label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input id="recon-search" className="pl-9" placeholder="Search reference, party, method..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="recon-status">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="recon-status" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="unmatched">Unmatched</SelectItem>
              <SelectItem value="matched">Matched</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'delivery_payment' | 'payout')}>
        <TabsList>
          <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
          <TabsTrigger value="delivery_payment"><Receipt className="h-3.5 w-3.5 mr-1" />Payments Received</TabsTrigger>
          <TabsTrigger value="payout"><ArrowUpCircle className="h-3.5 w-3.5 mr-1" />Payouts Issued</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                      <TableCell className="text-xs tabular-nums"><time dateTime={r.occurred_at}>{format(new Date(r.occurred_at), 'MMM d, yyyy')}</time></TableCell>
                      <TableCell>
                        {r.entry_type === 'delivery_payment'
                          ? <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">In</Badge>
                          : <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Out</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.payment_reference || '—'}</TableCell>
                      <TableCell className="text-sm">{r.party_label || '—'}</TableCell>
                      <TableCell className="text-xs">{r.payment_method || '—'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.amount)}</TableCell>
                      <TableCell>
                        {r.statement_url ? (
                          <Button variant="ghost" size="sm" onClick={() => viewStatement(r.statement_url!)}>
                            <FileText className="h-3.5 w-3.5 mr-1" aria-hidden="true" />View
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="relative gap-1" asChild={false}>
                            <span className="inline-flex items-center gap-1">
                              <Upload className="h-3.5 w-3.5" aria-hidden="true" />Upload
                              <input
                                type="file"
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                aria-label={`Upload statement for ${r.payment_reference || r.id.slice(0, 8)}`}
                                onChange={e => e.target.files?.[0] && uploadStatement(r, e.target.files[0])}
                              />
                            </span>
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status !== 'matched' && (
                            <Button size="icon" variant="ghost" onClick={() => setActionRow({ row: r, action: 'matched' })} aria-label="Mark matched">
                              <CheckCircle2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            </Button>
                          )}
                          {r.status !== 'disputed' && (
                            <Button size="icon" variant="ghost" onClick={() => setActionRow({ row: r, action: 'disputed' })} aria-label="Mark disputed">
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => { setNotesRow(r); setNotesDraft(r.notes || ''); }} aria-label="Edit notes">
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-10">
                      <p className="font-medium">No entries match these filters</p>
                      <p className="text-sm text-muted-foreground mt-1">Try a different reference, party, method, or status. New payments appear here after delivery or payout.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(''); setStatusFilter('all'); setTab('all'); }}>Clear filters</Button>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!notesRow} onOpenChange={(o) => !o && setNotesRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reconciliation notes</DialogTitle></DialogHeader>
          <Label htmlFor="recon-notes">Notes</Label>
          <Textarea id="recon-notes" value={notesDraft} onChange={e => setNotesDraft(e.target.value)} rows={5} placeholder="Bank ref, discrepancy reason, etc." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesRow(null)}>Cancel</Button>
            <Button onClick={saveNotes}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!actionRow} onOpenChange={(o) => !o && setActionRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionRow?.action === 'matched' ? 'Mark as matched?' : 'Mark as disputed?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionRow?.action === 'matched'
                ? 'This will mark the reconciliation entry as matched against your bank statement.'
                : 'This will mark the reconciliation entry as disputed. You can add notes explaining the discrepancy.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => actionRow && setStatus(actionRow.row, actionRow.action)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {actionRow?.action === 'matched' ? 'Mark Matched' : 'Mark Disputed'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
