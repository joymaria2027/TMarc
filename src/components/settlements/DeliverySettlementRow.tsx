import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, CreditCard, DollarSign, TrendingDown } from 'lucide-react';
import type { ExpenseItem, SettlementRow } from './MerchantSettlementCard';

interface DeliverySettlementRowProps {
  delivery: SettlementRow & {
    pickup_address?: string;
    dropoff_address?: string;
    delivered_at?: string | null;
  };
  canApprove: boolean;
  onApprove: (id: string) => void;
  paymentLabel: (d: SettlementRow) => string | null;
  payout: (total: number, pct: number) => string;
  netTariff: number;
  expenseDeduction: number;
  deliveryExpenses: ExpenseItem[];
  hasExpenseDeduction: boolean;
}

export default function DeliverySettlementRow({
  delivery: d,
  canApprove,
  onApprove,
  paymentLabel,
  payout,
  netTariff,
  expenseDeduction,
  deliveryExpenses,
  hasExpenseDeduction,
}: DeliverySettlementRowProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="font-medium text-sm">{d.order_reference || d.id.slice(0, 8)}</p>
            <p className="text-xs text-muted-foreground">{d.merchant_name}</p>
            {d.pickup_address && d.dropoff_address && (
              <p className="text-xs text-muted-foreground">{d.pickup_address} → {d.dropoff_address}</p>
            )}
            {d.delivered_at && (
              <p className="text-xs text-muted-foreground">
                Delivered: <time dateTime={d.delivered_at}>{new Date(d.delivered_at).toLocaleString()}</time>
              </p>
            )}
            {paymentLabel(d) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" aria-hidden="true" />Payment: {paymentLabel(d)}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-semibold tabular-nums">D{d.tariff.toFixed(2)}</Badge>
            {d.sharing ? (
              <Badge variant="secondary" className="text-xs">Ratio set</Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">No ratio</Badge>
            )}
            {d.settlement_approved ? (
              <Badge className="bg-accent/10 text-accent"><CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />Approved</Badge>
            ) : (
              canApprove && d.sharing && (
                <Button size="sm" onClick={() => onApprove(d.id)}>Approve</Button>
              )
            )}
          </div>
        </div>

        {d.sharing && (
          <div className="border-t pt-3">
            {hasExpenseDeduction && (
              <div className="bg-destructive/10 rounded p-2 mb-2 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" aria-hidden="true" />Expense deduction</span>
                  <span className="text-destructive font-semibold tabular-nums">-D{expenseDeduction.toFixed(2)}</span>
                </div>
                {deliveryExpenses.length > 0 && (
                  <div className="text-xs space-y-0.5 pt-1 border-t border-destructive/10">
                    {deliveryExpenses.map((e) => (
                      <div key={e.id} className="flex justify-between">
                        <span className="text-muted-foreground">{e.description}</span>
                        <span className="text-destructive tabular-nums">-D{Number(e.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <DollarSign className="h-3 w-3" aria-hidden="true" /> Payout Breakdown (Net D{netTariff.toFixed(2)})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-muted rounded p-2">
                <p className="text-muted-foreground">Rider ({d.sharing.rider_percentage}%)</p>
                <p className="font-semibold tabular-nums">D{payout(netTariff, d.sharing.rider_percentage)}</p>
              </div>
              <div className="bg-muted rounded p-2">
                <p className="text-muted-foreground">Merchant ({d.sharing.merchant_percentage}%)</p>
                <p className="font-semibold tabular-nums">D{payout(netTariff, d.sharing.merchant_percentage)}</p>
              </div>
              <div className="bg-muted rounded p-2">
                <p className="text-muted-foreground">Platform ({d.sharing.platform_percentage}%)</p>
                <p className="font-semibold tabular-nums">D{payout(netTariff, d.sharing.platform_percentage)}</p>
              </div>
              <div className="bg-muted rounded p-2">
                <p className="text-muted-foreground">UCS Rides ({d.sharing.ucs_rides_percentage}%)</p>
                <p className="font-semibold tabular-nums">D{payout(netTariff, d.sharing.ucs_rides_percentage)}</p>
              </div>
            </div>
          </div>
        )}

        {!d.sharing && (
          <p className="text-xs text-muted-foreground border-t pt-2">Set a sharing ratio for {d.merchant_name} in Revenue Sharing to enable auto-calculation</p>
        )}
      </CardContent>
    </Card>
  );
}
