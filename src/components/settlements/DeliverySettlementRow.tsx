import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { CheckCircle2, CreditCard } from 'lucide-react';
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
    <TableRow>
      <TableCell className="font-medium">{d.order_reference || d.id.slice(0, 8)}</TableCell>
      <TableCell>{d.merchant_name}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {d.pickup_address && d.dropoff_address ? `${d.pickup_address} → ${d.dropoff_address}` : '—'}
        {d.delivered_at && (
          <>
            {' • '}
            <time dateTime={d.delivered_at}>{new Date(d.delivered_at).toLocaleString()}</time>
          </>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {paymentLabel(d) ? (
          <span className="inline-flex items-center gap-1"><CreditCard className="h-3 w-3" aria-hidden="true" />{paymentLabel(d)}</span>
        ) : '—'}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">D{d.tariff.toFixed(2)}</TableCell>
      <TableCell className="text-right tabular-nums text-destructive">
        {hasExpenseDeduction ? `-D${expenseDeduction.toFixed(2)}` : '—'}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">D{netTariff.toFixed(2)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {d.sharing ? `D${payout(netTariff, d.sharing.rider_percentage)} (${d.sharing.rider_percentage}%)` : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {d.sharing ? `D${payout(netTariff, d.sharing.merchant_percentage)} (${d.sharing.merchant_percentage}%)` : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {d.sharing ? `D${payout(netTariff, d.sharing.platform_percentage)} (${d.sharing.platform_percentage}%)` : '—'}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {d.sharing ? `D${payout(netTariff, d.sharing.ucs_rides_percentage)} (${d.sharing.ucs_rides_percentage}%)` : '—'}
      </TableCell>
      <TableCell>
        {d.sharing ? (
          <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Ratio set</Badge>
        ) : (
          <span>
            <Badge variant="destructive" className="text-xs">No ratio</Badge>
            <span className="block text-xs text-muted-foreground mt-1">Set a sharing ratio for {d.merchant_name} in Revenue Sharing to enable auto-calculation</span>
          </span>
        )}
        {hasExpenseDeduction && deliveryExpenses.length > 0 && (
          <span className="block text-xs text-muted-foreground mt-1">
            Incl: {deliveryExpenses.map(e => `${e.description} (-D${Number(e.amount).toFixed(2)})`).join(', ')}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {d.settlement_approved ? (
          <Badge className="bg-accent/10 text-accent gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Approved</Badge>
        ) : (
          canApprove && d.sharing && (
            <Button size="sm" className="min-h-[44px]" onClick={() => onApprove(d.id)}>Approve</Button>
          )
        )}
      </TableCell>
    </TableRow>
  );
}
