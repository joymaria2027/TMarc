import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, CreditCard, DollarSign, TrendingDown, User } from 'lucide-react';
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
  paymentLabel,
  payout,
}: RiderSettlementCardProps) {
  const unapproved = rs.deliveries.filter(d => !d.settlement_approved && d.sharing);
  const allApproved = unapproved.length === 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold">{rs.rider_name}</p>
              <p className="text-xs text-muted-foreground">{rs.total_deliveries} deliveries</p>
            </div>
          </div>
          <Badge variant={rs.net_payout >= 0 ? 'default' : 'destructive'} className="text-sm tabular-nums">
            Net: D{rs.net_payout.toFixed(2)}
          </Badge>
        </div>

        {rs.total_expenses > 0 && (
          <div className="bg-destructive/10 rounded p-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" aria-hidden="true" />Approved Expenses</span>
              <span className="font-semibold text-destructive tabular-nums">-D{rs.total_expenses.toFixed(2)}</span>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View expense details</summary>
              <div className="mt-1 space-y-1">
                {expenseItems.map((e: ExpenseItem & { merchant_id?: string | null }) => (
                  <div key={e.id} className="flex justify-between py-0.5 border-b border-destructive/10 last:border-0">
                    <span>{e.description} {e.merchant_id ? `(${merchantNameById(e.merchant_id)})` : ''}</span>
                    <span className="font-medium text-destructive tabular-nums">-D{Number(e.amount).toFixed(2)}{e.deducted_in_delivery_id ? ' ✓' : ''}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
        <div className="flex items-center justify-between bg-muted rounded p-2 text-sm">
          <span className="text-muted-foreground font-medium">Net Revenue (after expenses)</span>
          <span className="font-bold text-primary tabular-nums">D{rs.net_revenue.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">Total Tariffs</p>
            <p className="font-semibold text-sm tabular-nums">D{rs.total_revenue.toFixed(2)}</p>
          </div>
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">Rider Share</p>
            <p className="font-semibold text-sm text-primary tabular-nums">D{rs.rider_share.toFixed(2)}</p>
          </div>
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">Net Payout</p>
            <p className={`font-semibold text-sm tabular-nums ${rs.net_payout >= 0 ? 'text-accent' : 'text-destructive'}`}>
              D{rs.net_payout.toFixed(2)}
            </p>
          </div>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            View {rs.total_deliveries} delivery details
          </summary>
          <div className="mt-2 space-y-2">
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
                    <CheckCircle2 className="h-3 w-3 text-accent" aria-hidden="true" />
                  ) : (
                    canApprove && d.sharing && (
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onApprove(d.id)}>Approve</Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>

        {canApprove && (
          allApproved ? (
            <Badge variant="outline" className="text-accent gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Payout Issued</Badge>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onIssuePayout(rs)}>
              <DollarSign className="h-3 w-3 mr-1" aria-hidden="true" />Issue Net Payout
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
