import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, ChevronDown, ChevronUp, Clock, DollarSign, Eye, FileText, Fuel, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export interface ExpenseItem {
  id: string;
  description: string;
  rider_id: string;
  merchant_id?: string | null;
  amount: number | string;
  consumed_amount?: number | string | null;
  expense_date: string;
  status: string;
  receipt_url?: string | null;
  deducted_in_delivery_id?: string | null;
}

export interface ExpenseConsumption {
  id: string;
  delivery_id: string;
  amount_consumed: number | string;
  kind: string;
  created_at: string;
}

interface ExpenseRowProps {
  expense: ExpenseItem;
  riderName: string;
  merchantName: string | null;
  consumptions: ExpenseConsumption[];
  isHighlighted: boolean;
  expanded: boolean;
  onToggleExpand: (open: boolean) => void;
  canVerify: boolean;
  onVerify: (expense: ExpenseItem) => void;
  onReject: (expense: ExpenseItem) => void;
  onOpenReceipt: (expense: ExpenseItem) => void;
  onViewDelivery: (deliveryId: string) => void;
  deliveryLabel: (deliveryId: string) => string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'verified') return <Badge className="bg-success/10 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Verified</Badge>;
  if (status === 'rejected') return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" aria-hidden="true" />Rejected</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" aria-hidden="true" />Pending</Badge>;
}

export default function ExpenseRow({
  expense: e,
  riderName,
  merchantName,
  consumptions: rowCons,
  isHighlighted,
  expanded,
  onToggleExpand,
  canVerify,
  onVerify,
  onReject,
  onOpenReceipt,
  onViewDelivery,
  deliveryLabel,
}: ExpenseRowProps) {
  return (
    <Card className={isHighlighted ? 'ring-2 ring-primary motion-safe:animate-pulse' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm">{e.description}</p>
            <p className="text-xs text-muted-foreground">
              Rider: {riderName}
              {e.merchant_id && merchantName && ` • Merchant: ${merchantName}`}
              {' • '}<time dateTime={e.expense_date}>{e.expense_date}</time>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <Badge variant="outline" className="gap-1 tabular-nums"><DollarSign className="h-3 w-3" aria-hidden="true" />D{Number(e.amount).toFixed(2)}</Badge>
            {Number(e.consumed_amount || 0) > 0 && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                Remaining D{(Number(e.amount) - Number(e.consumed_amount || 0)).toFixed(2)} / D{Number(e.amount).toFixed(2)}
              </Badge>
            )}
            <StatusBadge status={e.status} />
            {e.receipt_url ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                aria-label={`View receipt for expense ${e.id.slice(0, 8)}`}
                onClick={() => onOpenReceipt(e)}
              >
                <FileText className="h-3 w-3" aria-hidden="true" />View receipt
              </Button>
            ) : (
              <Badge variant="secondary">No receipt</Badge>
            )}
          </div>
        </div>
        {e.deducted_in_delivery_id ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs bg-accent/10 text-accent rounded p-1.5">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Deducted in settlement for delivery <span className="font-semibold">{e.deducted_in_delivery_id.slice(0, 8)}</span>
          </div>
        ) : (e.status === 'approved' || e.status === 'verified') ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs bg-warning/10 text-warning rounded p-1.5">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Approved – will be deducted from next settlement
          </div>
        ) : null}
        {rowCons.length > 0 && (
          <Collapsible open={expanded} onOpenChange={onToggleExpand}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-2 min-h-[44px] text-xs gap-1">
                {expanded ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                View {rowCons.length} deduction{rowCons.length === 1 ? '' : 's'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1 text-xs rounded border bg-muted/20 px-3 py-2">
                {rowCons.map(c => (
                  <div key={c.id} className="flex justify-between gap-2 items-center">
                    <span className="text-muted-foreground">
                      {format(new Date(c.created_at), 'MMM d HH:mm')} • delivery {deliveryLabel(c.delivery_id)}
                    </span>
                    <span className="flex items-center gap-1">
                      {c.kind === 'fuel' ? <Fuel className="h-3 w-3" aria-hidden="true" /> : null}
                      <Badge variant="outline" className="h-4 px-1 text-xs">{c.kind}</Badge>
                      <span className="font-medium tabular-nums">D{Number(c.amount_consumed).toFixed(2)}</span>
                      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`View delivery ${c.delivery_id.slice(0, 8)}`} onClick={() => onViewDelivery(c.delivery_id)}><Eye className="h-3 w-3" aria-hidden="true" /></Button>
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        {canVerify && e.status === 'pending' && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button size="sm" variant="outline" className="gap-1 text-success" onClick={() => onVerify(e)}>
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Verify
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => onReject(e)}>
              <XCircle className="h-3 w-3" aria-hidden="true" />Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
