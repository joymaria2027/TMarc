import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { Building2, CheckCircle2, ChevronDown, CreditCard, TrendingDown } from 'lucide-react';

export interface SettlementRow {
  id: string;
  order_reference: string | null;
  tariff: number;
  merchant_id: string;
  merchant_name: string;
  settlement_approved: boolean;
  settlement_source?: string | null;
  sharing: {
    rider_percentage: number;
    merchant_percentage: number;
    platform_percentage: number;
    ucs_rides_percentage: number;
  } | null;
  payment_method: string | null;
  payment_bank_name: string | null;
}

export interface MerchantSummary {
  merchant_id: string;
  merchant_name: string;
  total_deliveries: number;
  total_revenue: number;
  total_expenses: number;
  net_revenue: number;
  merchant_share: number;
  platform_share: number;
  ucs_share: number;
  rider_share: number;
  deliveries: SettlementRow[];
}

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number | string;
  deducted_in_delivery_id?: string | null;
}

interface MerchantSettlementCardProps {
  summary: MerchantSummary;
  expenseItems: ExpenseItem[];
  canApprove: boolean;
  onApprove: (id: string) => void;
  paymentLabel: (d: SettlementRow) => string | null;
}

export default function MerchantSettlementCard({
  summary: rs,
  expenseItems,
  canApprove,
  onApprove,
  paymentLabel,
}: MerchantSettlementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const approvedCount = rs.deliveries.filter(d => d.settlement_approved).length;

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="flex items-center gap-2 font-semibold">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            {rs.merchant_name}
          </span>
        </TableCell>
        <TableCell className="tabular-nums">{rs.total_deliveries}</TableCell>
        <TableCell className="text-right font-semibold tabular-nums">D{rs.total_revenue.toFixed(2)}</TableCell>
        <TableCell className="text-right font-semibold tabular-nums text-destructive">
          {rs.total_expenses > 0 ? `-D${rs.total_expenses.toFixed(2)}` : '—'}
        </TableCell>
        <TableCell className="text-right font-bold tabular-nums text-primary">D{rs.net_revenue.toFixed(2)}</TableCell>
        <TableCell className="text-right tabular-nums">D{rs.merchant_share.toFixed(2)}</TableCell>
        <TableCell className="text-right tabular-nums">D{rs.rider_share.toFixed(2)}</TableCell>
        <TableCell className="text-right tabular-nums">D{rs.platform_share.toFixed(2)}</TableCell>
        <TableCell className="text-right tabular-nums">D{rs.ucs_share.toFixed(2)}</TableCell>
        <TableCell className="text-right">
          <span className="inline-flex items-center justify-end gap-2">
            <Badge variant="outline" className="tabular-nums">{approvedCount}/{rs.total_deliveries} approved</Badge>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] gap-1"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} delivery details for ${rs.merchant_name}`}
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
          <TableCell colSpan={10}>
            <div className="space-y-3 py-1">
              {rs.total_expenses > 0 && (
                <div className="bg-destructive/10 rounded p-2 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" aria-hidden="true" />Rider Expenses (approved)</span>
                    <span className="font-semibold text-destructive tabular-nums">-D{rs.total_expenses.toFixed(2)}</span>
                  </div>
                  <div className="text-xs">
                    <p className="text-muted-foreground">Expense details</p>
                    <div className="mt-1 space-y-1">
                      {expenseItems.map((e) => (
                        <div key={e.id} className="flex justify-between py-0.5 border-b border-destructive/10 last:border-0">
                          <span>{e.description}</span>
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
                        {paymentLabel(d) && (
                          <span className="ml-2 text-muted-foreground inline-flex items-center gap-0.5"><CreditCard className="h-3 w-3" aria-hidden="true" />{paymentLabel(d)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">D{d.tariff.toFixed(2)}</span>
                        {d.settlement_approved ? (
                          <span className="inline-flex items-center gap-1 text-xs text-accent"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Approved{d.settlement_source === 'auto' ? ' (auto)' : ''}</span>
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
