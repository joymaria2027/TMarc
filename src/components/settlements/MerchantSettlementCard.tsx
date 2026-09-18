import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, CheckCircle2, CreditCard, TrendingDown } from 'lucide-react';

export interface SettlementRow {
  id: string;
  order_reference: string | null;
  tariff: number;
  merchant_id: string;
  merchant_name: string;
  settlement_approved: boolean;
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
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold">{rs.merchant_name}</p>
              <p className="text-xs text-muted-foreground">{rs.total_deliveries} deliveries</p>
            </div>
          </div>
          <Badge variant="outline" className="text-sm font-semibold tabular-nums">
            Total: D{rs.total_revenue.toFixed(2)}
          </Badge>
        </div>

        {rs.total_expenses > 0 && (
          <div className="bg-destructive/10 rounded p-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" aria-hidden="true" />Rider Expenses (approved)</span>
              <span className="font-semibold text-destructive tabular-nums">-D{rs.total_expenses.toFixed(2)}</span>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View expense details</summary>
              <div className="mt-1 space-y-1">
                {expenseItems.map((e) => (
                  <div key={e.id} className="flex justify-between py-0.5 border-b border-destructive/10 last:border-0">
                    <span>{e.description}</span>
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

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">Merchant Share</p>
            <p className="font-semibold text-sm text-primary tabular-nums">D{rs.merchant_share.toFixed(2)}</p>
          </div>
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">Rider Share</p>
            <p className="font-semibold text-sm tabular-nums">D{rs.rider_share.toFixed(2)}</p>
          </div>
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">Platform Share</p>
            <p className="font-semibold text-sm tabular-nums">D{rs.platform_share.toFixed(2)}</p>
          </div>
          <div className="bg-muted rounded p-2">
            <p className="text-muted-foreground">UCS Rides</p>
            <p className="font-semibold text-sm tabular-nums">D{rs.ucs_share.toFixed(2)}</p>
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
                  {paymentLabel(d) && (
                    <span className="ml-2 text-muted-foreground inline-flex items-center gap-0.5"><CreditCard className="h-3 w-3" aria-hidden="true" />{paymentLabel(d)}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">D{d.tariff.toFixed(2)}</span>
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
      </CardContent>
    </Card>
  );
}
