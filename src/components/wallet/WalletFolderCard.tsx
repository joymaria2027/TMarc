import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowUpFromLine, BarChart3, ChevronDown, FolderOpen } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface WalletRow {
  id: string;
  party_type: string;
  party_id: string | null;
  user_id: string | null;
  balance: number | string;
  updated_at: string;
  merchant_id: string | null;
}

export interface TransactionRow {
  id: string;
  wallet_id: string;
  type: string;
  amount: number | string;
  description: string;
  created_at: string;
}

export interface WalletBucket {
  id: string;
  label: string;
  icon: ReactNode;
  entries: [string, WalletRow[]][];
}

interface WalletFolderCardProps {
  bucket: WalletBucket;
  transactions: TransactionRow[];
  partyNames: Record<string, string>;
  getPartyLabel: (w: WalletRow) => string;
  canOwn: (w: WalletRow) => boolean;
  onWithdraw: (w: WalletRow) => void;
  search: string;
  onSearchChange: (bucketId: string, value: string) => void;
}

function matchesEntry(
  ws: WalletRow[],
  q: string,
  partyNames: Record<string, string>,
  getPartyLabel: (w: WalletRow) => string,
) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const head = ws[0];
  const baseLabel = head.party_type === 'rider' && head.party_id
    ? (partyNames[head.party_id] || 'Rider')
    : getPartyLabel(head);
  if (baseLabel.toLowerCase().includes(needle)) return true;
  return ws.some(w => w.merchant_id && (partyNames[w.merchant_id] || '').toLowerCase().includes(needle));
}


interface WalletBalanceCardProps {
  walletKey: string;
  wallets: WalletRow[];
  transactions: TransactionRow[];
  partyNames: Record<string, string>;
  getPartyLabel: (w: WalletRow) => string;
  canOwn: (w: WalletRow) => boolean;
  onWithdraw: (w: WalletRow) => void;
}

export function WalletBalanceCard({
  walletKey,
  wallets: ws,
  transactions,
  partyNames,
  getPartyLabel,
  canOwn,
  onWithdraw,
}: WalletBalanceCardProps) {
  const totalBalance = ws.reduce((s, w) => s + Number(w.balance), 0);
  const income = ws.reduce((s, w) => s + transactions.filter(t => t.wallet_id === w.id && t.type === 'credit').reduce((a, t) => a + Number(t.amount), 0), 0);
  const withdrawn = ws.reduce((s, w) => s + transactions.filter(t => t.wallet_id === w.id && t.type === 'debit').reduce((a, t) => a + Number(t.amount), 0), 0);
  const head = ws[0];
  const headerLabel = head.party_type === 'rider' && head.party_id
    ? `Rider: ${partyNames[head.party_id] || 'Rider'}`
    : getPartyLabel(head);
  const showBreakdown = ws.length > 1;

  return (
    <Card key={walletKey} className="relative">
      <CardHeader className="pb-2">
        <CardDescription className="capitalize">{head.party_type}</CardDescription>
        <CardTitle className="text-lg">{headerLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl tracking-tight tabular-nums text-primary">D {totalBalance.toFixed(2)}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {showBreakdown ? `Across ${ws.length} merchants` : `Updated ${new Date(head.updated_at).toLocaleDateString()}`}
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted rounded p-1.5">
            <p className="text-muted-foreground">Total Income</p>
            <p className="font-semibold tabular-nums text-success">D {income.toFixed(2)}</p>
          </div>
          <div className="bg-muted rounded p-1.5">
            <p className="text-muted-foreground">Withdrawn</p>
            <p className="font-semibold tabular-nums text-destructive">D {withdrawn.toFixed(2)}</p>
          </div>
        </div>

        {showBreakdown && ws.some(w => w.merchant_id && partyNames[w.merchant_id]) ? (
          <div className="mt-3 space-y-1.5 border-t pt-2">
            <p className="text-xs font-semibold text-muted-foreground">Per merchant</p>
            {ws.filter(w => w.merchant_id && partyNames[w.merchant_id]).map(w => (
              <div key={w.id} className="flex items-center justify-between text-xs gap-2">
                <span className="truncate">{partyNames[w.merchant_id!]}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium tabular-nums">D {Number(w.balance).toFixed(2)}</span>
                  {canOwn(w) && Number(w.balance) > 0 && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => onWithdraw(w)}>
                      <ArrowUpFromLine className="h-3 w-3" aria-hidden="true" /> Withdraw
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          canOwn(head) && Number(head.balance) > 0 && (
            <Button size="sm" className="mt-3 gap-1" onClick={() => onWithdraw(head)}>
              <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" /> Request Withdrawal
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

export default function WalletFolderCard({
  bucket: b,
  transactions,
  partyNames,
  getPartyLabel,
  canOwn,
  onWithdraw,
  search: q,
  onSearchChange,
}: WalletFolderCardProps) {
  const totalBal = b.entries.reduce((s, [, ws]) => s + ws.reduce((a, w) => a + Number(w.balance), 0), 0);
  const totalIncome = b.entries.reduce((s, [, ws]) => s + ws.reduce((a, w) => a + transactions.filter(t => t.wallet_id === w.id && t.type === 'credit').reduce((x, t) => x + Number(t.amount), 0), 0), 0);
  const totalWithdrawn = b.entries.reduce((s, [, ws]) => s + ws.reduce((a, w) => a + transactions.filter(t => t.wallet_id === w.id && t.type === 'debit').reduce((x, t) => x + Number(t.amount), 0), 0), 0);
  const filtered = b.entries.filter(([, ws]) => matchesEntry(ws, q, partyNames, getPartyLabel));

  const renderCard = (key: string, ws: WalletRow[]) => (
    <WalletBalanceCard
      key={key}
      walletKey={key}
      wallets={ws}
      transactions={transactions}
      partyNames={partyNames}
      getPartyLabel={getPartyLabel}
      canOwn={canOwn}
      onWithdraw={onWithdraw}
    />
  );

  type BreakdownRow = { date: string; walletId: string; walletLabel: string; income: number; withdrawals: number };
  const rowsMap = new Map<string, BreakdownRow>();
  filtered.forEach(([, ws]) => {
    ws.forEach(w => {
      const label = w.party_type === 'rider' && w.party_id
        ? `${partyNames[w.party_id] || 'Rider'}${w.merchant_id ? ' – ' + (partyNames[w.merchant_id] || 'Merchant') : ''}`
        : getPartyLabel(w);
      transactions.filter(t => t.wallet_id === w.id).forEach(t => {
        const date = new Date(t.created_at).toISOString().slice(0, 10);
        const key = `${date}__${w.id}`;
        const existing = rowsMap.get(key) || { date, walletId: w.id, walletLabel: label, income: 0, withdrawals: 0 };
        if (t.type === 'credit') existing.income += Number(t.amount);
        else if (t.type === 'debit') existing.withdrawals += Number(t.amount);
        rowsMap.set(key, existing);
      });
    });
  });
  const breakdownRows = Array.from(rowsMap.values()).sort((a, c) => c.date.localeCompare(a.date) || a.walletLabel.localeCompare(c.walletLabel));
  const totalIn = breakdownRows.reduce((s, r) => s + r.income, 0);
  const totalOut = breakdownRows.reduce((s, r) => s + r.withdrawals, 0);

  return (
    <Collapsible defaultOpen>
      <Card>
        <CollapsibleTrigger className="w-full group">
          <CardHeader className="pb-3 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" aria-hidden="true" />
              {b.icon}
              <CardTitle className="text-base">{b.label}</CardTitle>
              <Badge variant="secondary" className="ml-1">{b.entries.length}</Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Balance</p>
                <p className="text-base tabular-nums text-primary leading-tight">D {totalBal.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Income</p>
                <p className="text-base tabular-nums text-success leading-tight">D {totalIncome.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Withdrawn</p>
                <p className="text-base tabular-nums text-destructive leading-tight">D {totalWithdrawn.toFixed(2)}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" aria-hidden="true" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            <Input
              placeholder={`Search ${b.label.toLowerCase()}…`}
              value={q}
              onChange={(e) => onSearchChange(b.id, e.target.value)}
              className="max-w-xs h-8 text-sm"
              aria-label={`Search ${b.label.toLowerCase()}`}
            />
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No wallets match &quot;{q}&quot;.</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map(([k, ws]) => renderCard(k, ws))}
                </div>

                <Collapsible className="mt-4">
                  <CollapsibleTrigger className="w-full group flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/60">
                    <span className="flex items-center gap-2 font-medium">
                      <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                      Transaction breakdown
                      <Badge variant="secondary" className="ml-1">{breakdownRows.length}</Badge>
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {breakdownRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 px-3">No transactions yet.</p>
                    ) : (
                      <div className="border rounded-md mt-2 overflow-hidden">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Wallet</TableHead>
                                <TableHead className="text-right">Income (D)</TableHead>
                                <TableHead className="text-right">Withdrawals (D)</TableHead>
                                <TableHead className="text-right">Net (D)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {breakdownRows.map((r, i) => (
                                <TableRow key={`${r.date}-${r.walletId}-${i}`}>
                                  <TableCell className="whitespace-nowrap tabular-nums"><time dateTime={r.date}>{r.date}</time></TableCell>
                                  <TableCell className="text-sm">{r.walletLabel}</TableCell>
                                  <TableCell className="text-right tabular-nums text-success">{r.income > 0 ? r.income.toFixed(2) : '–'}</TableCell>
                                  <TableCell className="text-right tabular-nums text-destructive">{r.withdrawals > 0 ? r.withdrawals.toFixed(2) : '–'}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{(r.income - r.withdrawals).toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow>
                                <TableCell colSpan={2} className="font-semibold">Totals</TableCell>
                                <TableCell className="text-right tabular-nums text-success font-semibold">{totalIn.toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums text-destructive font-semibold">{totalOut.toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums font-semibold">{(totalIn - totalOut).toFixed(2)}</TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
