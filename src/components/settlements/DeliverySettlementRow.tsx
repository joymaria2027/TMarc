import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableCell, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CheckCircle2, CreditCard, ShieldAlert } from 'lucide-react';
import { needsProofReview } from '@/lib/deliveries';
import type { ExpenseItem, SettlementRow } from './MerchantSettlementCard';

interface DeliverySettlementRowProps {
  delivery: SettlementRow & {
    pickup_address?: string;
    dropoff_address?: string;
    delivered_at?: string | null;
    picked_up_at?: string | null;
    gps_confirmed?: boolean;
    receipt_attached?: boolean;
  };
  canApprove: boolean;
  onApprove: (id: string) => void;
  paymentLabel: (d: SettlementRow) => string | null;
  payout: (total: number, pct: number) => string;
  netTariff: number;
  expenseDeduction: number;
  deliveryExpenses: ExpenseItem[];
  hasExpenseDeduction: boolean;
  selected?: boolean;
  onSelectChange?: () => void;
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
  selected = false,
  onSelectChange,
}: DeliverySettlementRowProps) {
  const [proofConfirmOpen, setProofConfirmOpen] = useState(false);
  // Money must not move one-click on proof-less runs — verify first.
  const proofNeeded = !d.settlement_approved && needsProofReview(d);
  return (
    <TableRow>
      <TableCell className="w-12">
        {canApprove && onSelectChange ? (
          <Checkbox
            checked={selected}
            onCheckedChange={onSelectChange}
            aria-label={`Select order ${d.order_reference || d.id.slice(0, 8)}`}
          />
        ) : null}
      </TableCell>
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
          <span className="inline-flex items-center gap-1">
            <Badge className="bg-accent/10 text-accent gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Approved</Badge>
            {d.settlement_source === 'auto' && <Badge variant="secondary" className="text-xs">Auto</Badge>}
          </span>
        ) : (
          canApprove && d.sharing && (
            <>
              <Button
                size="sm"
                className="min-h-[44px]"
                onClick={() => (proofNeeded ? setProofConfirmOpen(true) : onApprove(d.id))}
              >
                Approve
              </Button>
              <AlertDialog open={proofConfirmOpen} onOpenChange={setProofConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>No start proof for {d.order_reference || d.id.slice(0, 8)}</AlertDialogTitle>
                    <AlertDialogDescription>
                      This delivery completed with no pickup record and no receipt. Verify the run
                      happened before paying — approving credits rider, merchant, platform and UCS wallets.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onApprove(d.id)}>Approve anyway</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )
        )}
        {proofNeeded && (
          <span className="block mt-1">
            <Badge variant="destructive" className="text-xs gap-1" title="Completed with no pickup record and no receipt — verify the run happened before paying">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />No start proof — verify before paying
            </Badge>
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
