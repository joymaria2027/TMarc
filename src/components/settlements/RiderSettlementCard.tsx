import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { CheckCircle2, ChevronDown, CreditCard, DollarSign, TrendingDown, User } from 'lucide-react';
import type { ExpenseItem, SettlementRow } from './MerchantSettlementCard';

export interface RiderSummary {
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

interface RiderSettlementCardProps {
  summary: RiderSummary;
  expenseItems: ExpenseItem[];
  merchantNameById: (merchantId: string) => string;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onIssuePayout: (summary: RiderSummary) => void;
  issuing?: boolean;
  paymentLabel: (d: SettlementRow) => string | null;
  payout: (total: number, pct: number) => string;
}

export default function RiderSettlementCard({
  summary: rs,
  expenseItems,
  merchantNameById,
  canApprove,
  onApprove,
  onIssuePayout,
  issuing = false,
  paymentLabel,
  payout,
}: RiderSettlementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const unapproved = rs.deliveries.filter(d => !d.settlement_approved && d.sharing);
  const allApproved = unapproved.length === 0;

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="flex items-center gap-2 font-semibold">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            {rs.rider_name}
          </span>
        </TableCell>
        <TableCell className="tabular-nums">{rs.total_deliveries}</TableCell>
        <TableCell className="text-right tabular-nums">D{rs.total_revenue.toFixed(2)}</TableCell>
        <TableCell className="text-right tabular-nums text-destructive">
          {rs.total_expenses > 0 ? `-D${rs.total_expenses.toFixed(2)}` : '—'}
        </TableCell>
        <TableCell className="text-right font-bold tabular-nums text-primary">D{rs.net_revenue.toFixed(2)}</TableCell>
        <TableCell className="text-right tabular-nums">D{rs.rider_share.toFixed(2)}</TableCell>
        <TableCell className="text-right">
          <Badge variant={rs.net_payout >= 0 ? 'default' : 'destructive'} className="tabular-nums">
            Net: D{rs.net_payout.toFixed(2)}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <span className="inline-flex items-center justify-end gap-2">
            {canApprove && (
              allApproved ? (
                <Badge variant="outline" className="text-accent gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Payout Issued</Badge>
              ) : (
                <Button size="sm" variant="outline" className="min-h-[44px]" disabled={issuing} onClick={() => onIssuePayout(rs)}>
                  <DollarSign className="h-3 w-3 mr-1" aria-hidden="true" />{issuing ? 'Issuing…' : 'Issue Net Payout'}
                </Button>
              )
            )}
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] gap-1"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} delivery details for ${rs.rider_name}`}
              onClick={() => setExpanded(v => !v)}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              Details
            </Button>
          </span>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={8}>
            <div className="space-y-3 py-1">
              {rs.total_expenses > 0 && (
                <div className="bg-destructive/10 rounded p-2 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" aria-hidden="true" />Approved Expenses</span>
                    <span className="font-semibold text-destructive tabular-nums">-D{rs.total_expenses.toFixed(2)}</span>
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground">Expense details</p>
                    <div className="mt-1 space-y-1">
                      {expenseItems.map((e: ExpenseItem & { merchant_id?: string | null }) => (
                        <div key={e.id} className="flex justify-between py-0.5 border-b border-destructive/10 last:border-0">
                          <span>{e.description} {e.merchant_id ? `(${merchantNameById(e.merchant_id)})` : ''}</span>
                          <span className="font-medium text-destructive tabular-nums">-D{Number(e.amount).toFixed(2)}{e.deducted_in_delivery_id ? ' ✓' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">{rs.total_deliveries} delivery details</p>
                <div className="space-y-2">
                  {rs.deliveries.map(d => (
                    <div key={d.id} className="border rounded p-2 flex items-center justify-between flex-wrap gap-1">
                      <div>
                        <span className="font-medium">{d.order_reference || d.id.slice(0, 8)}</span>
                        <span className="text-muted-foreground ml-2">{d.merchant_name}</span>
                        {paymentLabel(d) && (
                          <span className="ml-2 text-muted-foreground inline-flex items-center gap-0.5"><CreditCard className="h-3 w-3" aria-hidden="true" />{paymentLabel(d)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">D{d.tariff.toFixed(2)}</span>
                        {d.sharing && <span className="text-primary tabular-nums">→ D{payout(d.tariff, d.sharing.rider_percentage)}</span>}
                        {d.settlement_approved ? (
                          <span className="inline-flex items-center gap-1 text-xs text-accent"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Approved</span>
                        ) : (
                          canApprove && d.sharing && (
                            <Button size="sm" variant="outline" className="min-h-[44px] text-xs" onClick={() => onApprove(d.id)}>Approve</Button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
