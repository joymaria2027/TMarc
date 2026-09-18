import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownToLine, CheckCircle2, Clock, Search, XCircle } from 'lucide-react';
import type { WalletRow } from './WalletFolderCard';
import { Table, TableBody, TableCell, TableCaption, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface WithdrawalRow {
  id: string;
  wallet_id: string;
  amount: number | string;
  status: string;
  payout_method: string | null;
  notes: string | null;
  created_at: string;
}

interface WithdrawalRequestsTableProps {
  withdrawals: WithdrawalRow[];
  wallets: WalletRow[];
  getPartyLabel: (w: WalletRow) => string;
  canProcess: boolean;
  canApprove: boolean;
  canFinalize: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  onApprove: (wr: WithdrawalRow) => void;
  onFinalize: (wr: WithdrawalRow) => void;
  pageSize?: number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'secondary',
    manager_approved: 'outline',
    processing: 'outline',
    completed: 'default',
    rejected: 'destructive',
  };
  const labels: Record<string, string> = {
    pending: 'Pending Manager',
    manager_approved: 'Awaiting Accountant',
    completed: 'Completed',
    rejected: 'Rejected',
  };
  return <Badge variant={(map[status] as 'secondary' | 'outline' | 'default' | 'destructive') || 'secondary'} className="capitalize">{labels[status] || status}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />;
  if (status === 'rejected') return <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  return <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

export default function WithdrawalRequestsTable({
  withdrawals,
  wallets,
  getPartyLabel,
  canProcess,
  canApprove,
  canFinalize,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  page,
  onPageChange,
  onApprove,
  onFinalize,
  pageSize = 10,
}: WithdrawalRequestsTableProps) {
  const needle = search.trim().toLowerCase();
  let filtered = withdrawals;
  if (statusFilter !== 'all') filtered = filtered.filter(wr => wr.status === statusFilter);
  if (needle) {
    filtered = filtered.filter(wr => {
      const wallet = wallets.find(w => w.id === wr.wallet_id);
      const label = wallet ? getPartyLabel(wallet).toLowerCase() : '';
      return label.includes(needle)
        || wr.status.toLowerCase().includes(needle)
        || (wr.payout_method || '').toLowerCase().includes(needle)
        || (wr.notes || '').toLowerCase().includes(needle)
        || String(wr.amount).includes(needle);
    });
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" aria-hidden="true" /> Withdrawal Requests</CardTitle>
          <Badge variant="secondary">{withdrawals.length} total</Badge>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search wallet, status, method, notes, amount…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9"
              aria-label="Search withdrawal requests"
            />
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-[200px] h-9" aria-label="Filter by withdrawal status"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending Manager</SelectItem>
              <SelectItem value="manager_approved">Awaiting Accountant</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-6" role="status">No withdrawal requests match your search</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <Table aria-label="Withdrawal requests">
                <TableCaption className="sr-only">Withdrawal requests with status, amounts, and actions</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payout Method</TableHead>
                    <TableHead>Notes</TableHead>
                    {canProcess && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(wr => {
                    const wallet = wallets.find(w => w.id === wr.wallet_id);
                    return (
                      <TableRow key={wr.id}>
                        <TableCell className="whitespace-nowrap tabular-nums"><time dateTime={wr.created_at}>{new Date(wr.created_at).toLocaleDateString()}</time></TableCell>
                        <TableCell>{wallet ? getPartyLabel(wallet) : '–'}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">D {Number(wr.amount).toFixed(2)}</TableCell>
                        <TableCell><StatusBadge status={wr.status} /></TableCell>
                        <TableCell>{wr.payout_method || '–'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{wr.notes || '–'}</TableCell>
                        {canProcess && (
                          <TableCell className="text-right">
                            {wr.status === 'pending' && canApprove && (
                              <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => onApprove(wr)}>
                                Approve
                              </Button>
                            )}
                            {wr.status === 'manager_approved' && canFinalize && (
                              <Button size="sm" className="min-h-[44px]" onClick={() => onFinalize(wr)}>
                                Finalize
                              </Button>
                            )}
                            {wr.status === 'pending' && !canApprove && (
                              <span className="text-xs text-muted-foreground">Awaiting manager</span>
                            )}
                            {wr.status === 'manager_approved' && !canFinalize && (
                              <span className="text-xs text-muted-foreground">Awaiting accountant</span>
                            )}
                            {(wr.status === 'completed' || wr.status === 'rejected') && (
                              <span className="flex items-center justify-end gap-1"><StatusIcon status={wr.status} /></span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={canProcess ? 7 : 6} className="text-xs text-muted-foreground text-right py-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 flex-wrap gap-2">
                        <span>Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}</span>
                        {totalPages > 1 && (
                          <nav aria-label="Withdrawal requests pagination" className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={safePage <= 1}
                              onClick={() => onPageChange(Math.max(1, safePage - 1))}
                              aria-label="Go to previous page"
                            >
                              Previous
                            </Button>
                            {pageNumbers.map((p, idx) => (
                              <span key={p} className="contents">
                                {idx > 0 && pageNumbers[idx - 1] !== p - 1 && (
                                  <span className="px-1 text-muted-foreground" aria-hidden="true">…</span>
                                )}
                                <Button
                                  size="sm"
                                  variant={p === safePage ? 'default' : 'ghost'}
                                  aria-current={p === safePage ? 'page' : undefined}
                                  aria-label={`Go to page ${p}`}
                                  onClick={() => onPageChange(p)}
                                >
                                  {p}
                                </Button>
                              </span>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={safePage >= totalPages}
                              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
                              aria-label="Go to next page"
                            >
                              Next
                            </Button>
                          </nav>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
