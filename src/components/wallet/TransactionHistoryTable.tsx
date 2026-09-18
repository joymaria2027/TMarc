import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Search, TrendingDown, TrendingUp } from 'lucide-react';
import type { TransactionRow, WalletRow } from './WalletFolderCard';

interface TransactionHistoryTableProps {
  transactions: TransactionRow[];
  wallets: WalletRow[];
  myWallets: WalletRow[];
  getPartyLabel: (w: WalletRow) => string;
  filter: string;
  onFilterChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  pageSize?: number;
}

export default function TransactionHistoryTable({
  transactions,
  wallets,
  myWallets,
  getPartyLabel,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  page,
  onPageChange,
  pageSize = 20,
}: TransactionHistoryTableProps) {
  const myWalletIds = myWallets.map(w => w.id);
  let filtered = transactions.filter(t => myWalletIds.includes(t.wallet_id));
  if (filter === 'credit') filtered = filtered.filter(t => t.type === 'credit');
  else if (filter === 'debit') filtered = filtered.filter(t => t.type === 'debit');
  else if (filter !== 'all') filtered = filtered.filter(t => t.wallet_id === filter);

  const needle = search.trim().toLowerCase();
  if (needle) {
    filtered = filtered.filter(tx => {
      const wallet = wallets.find(w => w.id === tx.wallet_id);
      const label = wallet ? getPartyLabel(wallet).toLowerCase() : '';
      return (tx.description || '').toLowerCase().includes(needle)
        || label.includes(needle)
        || String(tx.amount).includes(needle);
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
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" aria-hidden="true" /> Transaction History</CardTitle>
          <Select value={filter} onValueChange={onFilterChange}>
            <SelectTrigger className="w-[180px]" aria-label="Filter transactions"><SelectValue placeholder="Filter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="credit">Credits Only</SelectItem>
              <SelectItem value="debit">Debits Only</SelectItem>
              {myWallets.map(w => (
                <SelectItem key={w.id} value={w.id}>{getPartyLabel(w)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search description, wallet, reference, amount…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
            aria-label="Search transactions"
          />
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No transactions match your search</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Date & Time</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Wallet</th>
                    <th className="pb-2 pr-4 text-right">Amount</th>
                    <th className="pb-2 pr-4">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(tx => {
                    const wallet = wallets.find(w => w.id === tx.wallet_id);
                    return (
                      <tr key={tx.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap tabular-nums"><time dateTime={tx.created_at}>{new Date(tx.created_at).toLocaleString()}</time></td>
                        <td className="py-2 pr-4">
                          <span className={`flex items-center gap-1 font-medium ${tx.type === 'credit' ? 'text-success' : 'text-destructive'}`}>
                            {tx.type === 'credit' ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
                            {tx.type === 'credit' ? 'Credit' : 'Debit'}
                          </span>
                        </td>
                        <td className="py-2 pr-4">{wallet ? getPartyLabel(wallet) : '–'}</td>
                        <td className={`py-2 pr-4 font-medium tabular-nums text-right ${tx.type === 'credit' ? 'text-success' : 'text-destructive'}`}>
                          {tx.type === 'credit' ? '+' : '-'} D {Number(tx.amount).toFixed(2)}
                        </td>
                        <td className="py-2 pr-4 max-w-[250px] truncate">{tx.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 flex-wrap gap-2">
              <span>Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length}</span>
              {totalPages > 1 && (
                <nav aria-label="Transaction history pagination" className="flex items-center gap-1">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
