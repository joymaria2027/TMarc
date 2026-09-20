import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, DollarSign, MapPin, Play, Square } from 'lucide-react';
import PaymentMethodSelect from '@/components/PaymentMethodSelect';
import ReceiptUpload from '@/components/ReceiptUpload';
import CompletionCodeDialog from '@/components/rider/CompletionCodeDialog';
import { canMarkCompleted } from '@/pages/riderDashboard.helpers';

export interface QueueDelivery {
  id: string;
  status: string;
  order_reference: string | null;
  pickup_address: string;
  dropoff_address: string;
  estimated_tariff: number | null;
  payment_method?: string | null;
  payment_bank_name?: string | null;
  receipt_attached?: boolean | null;
}

interface QueueCardProps {
  delivery: QueueDelivery;
  hasActiveDelivery: boolean;
  statusColor: (s: string) => string;
  onAccept: (delivery: QueueDelivery) => void;
  onDecline: (delivery: QueueDelivery) => void;
  onStart: (delivery: QueueDelivery) => void;
  onMarkCompleted: (delivery: QueueDelivery) => void;
  onCancelAcceptance: (delivery: QueueDelivery) => void;
  onPaymentSaved: (deliveryId: string, method: string | null, bank: string | null) => void;
  /** Rider id for the inline receipt upload (anti-abuse proof gate). */
  userId?: string | null;
  onReceiptUploaded?: (deliveryId: string) => void;
  paymentSlot?: ReactNode;
}

export default function QueueCard({
  delivery: d,
  hasActiveDelivery,
  statusColor,
  onAccept,
  onDecline,
  onStart,
  onMarkCompleted,
  onCancelAcceptance,
  onPaymentSaved,
  userId,
  onReceiptUploaded,
}: QueueCardProps) {
  // Anti-abuse: Mark Completed pays out via settlement, so it stays locked
  // until the rider attaches a delivery receipt as proof of the run. On top of
  // that sits the customer handover-code gate: clicking opens the code dialog
  // and only a server-verified code lets the completion update through.
  const markAllowed = canMarkCompleted(d);
  const [codeOpen, setCodeOpen] = useState(false);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-sm">{d.order_reference || d.id.slice(0, 8)}</span>
          <Badge className={statusColor(d.status)}>{d.status}</Badge>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{d.pickup_address}</p>
          <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{d.dropoff_address}</p>
          {d.estimated_tariff && <p className="flex items-center gap-1 tabular-nums"><DollarSign className="h-3.5 w-3.5" aria-hidden="true" />D{Number(d.estimated_tariff).toFixed(2)}</p>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {d.status === 'dispatched' && (
            <>
              <Button onClick={() => onAccept(d)} className="flex-1 min-h-[44px]" size="sm" variant="default">
                <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />Accept
              </Button>
              <Button onClick={() => onDecline(d)} className="flex-1 min-h-[44px]" size="sm" variant="destructive">
                <Square className="h-4 w-4 mr-2" aria-hidden="true" />Decline
              </Button>
            </>
          )}
          {d.status === 'accepted' && !hasActiveDelivery && (
            <Button onClick={() => onStart(d)} className="flex-1 min-h-[44px]" size="sm">
              <Play className="h-4 w-4 mr-2" aria-hidden="true" />Start Delivery
            </Button>
          )}
          {d.status === 'accepted' && !hasActiveDelivery && (
            <Button
              onClick={() => setCodeOpen(true)}
              variant="outline"
              className="flex-1 min-h-[44px]"
              size="sm"
              disabled={!markAllowed}
              title={markAllowed ? undefined : 'Attach a receipt first — proof is required to complete'}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />Mark Completed
            </Button>
          )}
          {d.status === 'accepted' && !markAllowed && (
            <p className="w-full text-xs text-muted-foreground" role="note">
              Attach a receipt first — proof is required to mark this run completed.
            </p>
          )}
          {d.status === 'accepted' && !d.receipt_attached && userId && (
            <div className="w-full">
              <ReceiptUpload
                deliveryId={d.id}
                orderReference={d.order_reference}
                userId={userId}
                onUploaded={() => onReceiptUploaded?.(d.id)}
              />
            </div>
          )}
          {(d.status === 'dispatched' || d.status === 'accepted') && (
            <Button onClick={() => onCancelAcceptance(d)} variant="outline" size="sm" className="flex-1 min-h-[44px]">
              <Square className="h-4 w-4 mr-2" aria-hidden="true" />Cancel acceptance
            </Button>
          )}
        </div>

        {d.status === 'accepted' && (
          <div className="mt-2">
            <PaymentMethodSelect
              deliveryId={d.id}
              currentMethod={d.payment_method}
              currentBankName={d.payment_bank_name}
              onSaved={(method, bank) => onPaymentSaved(d.id, method, bank)}
            />
          </div>
        )}

        {codeOpen && (
          <CompletionCodeDialog
            open={codeOpen}
            onOpenChange={setCodeOpen}
            deliveryId={d.id}
            orderReference={d.order_reference}
            onVerified={() => {
              setCodeOpen(false);
              onMarkCompleted(d);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
