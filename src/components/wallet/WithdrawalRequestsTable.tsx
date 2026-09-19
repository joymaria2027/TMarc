import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowDownToLine, CheckCircle2, Clock, Search, XCircle, Download, X } from 'lucide-react';
import type { WalletRow } from './WalletFolderCard';
import { Table, TableBody, TableCell, TableCaption, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/finance';
import { buildCsvRows, downloadCsv, generateExportFilename } from '@/lib/financeExport';

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
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  amountMin: string;
  onAmountMinChange: (v: string) => void;
  amountMax: string;
  onAmountMaxChange: (v: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  onApprove: (wr: WithdrawalRow) => void;
  onFinalize: (wr: WithdrawalRow) => void;
  // Bulk selection is parent-owned (single source of truth for bulk writes).
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleSelectAll: (filteredIds: string[]) => void;
  bulkActionPending: 'approve' | 'reject' | null;
  onBulkApprove: () => void;
  onBulkReject: () => void;
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
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  amountMin,
  onAmountMinChange,
  amountMax,
  onAmountMaxChange,
  page,
  onPageChange,
  onApprove,
  onFinalize,
  selectedIds,
  onToggleRow,
  onToggleSelectAll,
  bulkActionPending,
  onBulkApprove,
  onBulkReject,
  pageSize = 10,
}: WithdrawalRequestsTableProps) {
  const needle = search.trim().toLowerCase();
  let filtered = withdrawals;
  if (statusFilter !== 'all') filtered = filtered.filter(wr => wr.status === statusFilter);
  if (dateFrom) filtered = filtered.filter(wr => wr.created_at >= dateFrom);
  if (dateTo) filtered = filtered.filter(wr => wr.created_at <= dateTo);
  if (amountMin) filtered = filtered.filter(wr => Number(wr.amount) >= Number(amountMin));
  if (amountMax) filtered = filtered.filter(wr => Number(wr.amount) <= Number(amountMax));
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

  const hasFilters = dateFrom || dateTo || amountMin || amountMax || statusFilter !== 'all' || search;

  // Selection + totals derive from the parent-owned set (no placeholder).
  const selectedIdsSet = selectedIds;
  const isIndeterminate = selectedIdsSet.size > 0 && selectedIdsSet.size < filtered.length;
  const selectedTotal = filtered
    .filter(wr => selectedIdsSet.has(wr.id))
    .reduce((s, wr) => s + Number(wr.amount || 0), 0);
  const filteredIds = filtered.map(wr => wr.id);

  const handleExportCsv = () => {
    // F3: export the filtered set (not just the visible page) and say so.
    const columns = [
      { key: 'created_at', header: 'Date', format: (v: string) => new Date(v).toLocaleDateString() },
      { key: 'wallet_label', header: 'Wallet', format: (v: string) => v },
      { key: 'amount', header: 'Amount', format: (v: number | string) => formatMoney(v) },
      { key: 'status', header: 'Status' },
      { key: 'payout_method', header: 'Payout Method', format: (v: string | null) => v || '–' },
      { key: 'notes', header: 'Notes', format: (v: string | null) => v || '–' },
    ];
    const rowsWithWallet = filtered.map(wr => {
      const wallet = wallets.find(w => w.id === wr.wallet_id);
      return { ...wr, wallet_label: wallet ? getPartyLabel(wallet) : '–' };
    });
    const csvRows = buildCsvRows(rowsWithWallet, columns);
    downloadCsv(csvRows, generateExportFilename('wallet-withdrawals', { scope: 'filtered', rowCount: filtered.length }));
  };

  const clearAllFilters = () => {
    onSearchChange('');
    onStatusFilterChange('all');
    onDateFromChange('');
    onDateToChange('');
    onAmountMinChange('');
    onAmountMaxChange('');
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><ArrowDownToLine className="h-5 w-5" aria-hidden="true" /> Withdrawal Requests</CardTitle>
          <Badge variant="secondary">{withdrawals.length} total</Badge>
        </div>
        {/* Filter Bar */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search wallet, status, method, notes, amount…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-9"
                type="search"
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
            <Input type="date" className="w-full sm:w-36 h-9" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} placeholder="From" aria-label="Date from" />
            <Input type="date" className="w-full sm:w-36 h-9" value={dateTo} onChange={e => onDateToChange(e.target.value)} placeholder="To" aria-label="Date to" />
            <Input type="number" step="0.01" className="w-full sm:w-28 h-9" value={amountMin} onChange={e => onAmountMinChange(e.target.value)} placeholder="Min" aria-label="Min amount" />
            <Input type="number" step="0.01" className="w-full sm:w-28 h-9" value={amountMax} onChange={e => onAmountMaxChange(e.target.value)} placeholder="Max" aria-label="Max amount" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* F3: the button states the scope the file will actually hold. */}
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1 min-h-[44px]">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />Export filtered ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1 min-h-[44px]">
                <X className="h-3.5 w-3.5" aria-hidden="true" />Clear all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {/* F2/F-P2-8: stable bulk action bar between header and table — selection
          state is visible even when the selection outlives the visible page. */}
      {canProcess && (
        <div className="flex flex-wrap items-center gap-2 px-6 pb-2">
          <span className="text-sm text-muted-foreground tabular-nums" role="status">
            {bulkActionPending
              ? bulkActionPending === 'approve' ? 'Approving…' : 'Rejecting…'
              : selectedIdsSet.size > 0
                ? `${selectedIdsSet.size} selected · ${formatMoney(selectedTotal)}`
                : 'No requests selected'}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            onClick={onBulkApprove}
            disabled={selectedIdsSet.size === 0 || bulkActionPending !== null}
          >
            Approve selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            onClick={onBulkReject}
            disabled={selectedIdsSet.size === 0 || bulkActionPending !== null}
          >
            Reject selected
          </Button>
        </div>
      )}
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
                    <TableHead className="w-12">
                      <Checkbox
                        checked={filtered.length > 0 && selectedIdsSet.size === filtered.length}
                        indeterminate={isIndeterminate}
                        onCheckedChange={() => onToggleSelectAll(filteredIds)}
                        aria-label="Select all visible rows"
                        disabled={filtered.length === 0}
                      />
                    </TableHead>
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
                        <TableCell className="w-12">
                          <Checkbox
                            checked={selectedIdsSet.has(wr.id)}
                            onCheckedChange={() => onToggleRow(wr.id)}
                            aria-label={`Select row ${wr.id.slice(0, 8)}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums"><time dateTime={wr.created_at}>{new Date(wr.created_at).toLocaleDateString()}</time></TableCell>
                        <TableCell>{wallet ? getPartyLabel(wallet) : '–'}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatMoney(wr.amount)}</TableCell>
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
                {filtered.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={canProcess ? 8 : 7} className="text-right py-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs text-muted-foreground">Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}</span>
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
                )}
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}