import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, DollarSign, Eye, Ruler, Square } from 'lucide-react';

export interface OfferDelivery {
  id: string;
  order_reference: string | null;
  pickup_address: string;
  dropoff_address: string;
  merchant_id?: string | null;
  estimated_tariff: number | null;
  merchants?: { name: string } | null;
}

export interface OfferRevShare {
  rider_percentage: number | string;
  merchant_percentage: number | string;
  ucs_rides_percentage: number | string;
  platform_percentage: number | string;
}

interface OfferCardProps {
  delivery: OfferDelivery;
  distanceKm: number | null;
  tariff: number;
  riderShare: number | null;
  revShare?: OfferRevShare;
  onView: (delivery: OfferDelivery) => void;
  onAccept: (delivery: OfferDelivery) => void;
  onReject: (delivery: OfferDelivery) => void;
}

export default function OfferCard({
  delivery: d,
  distanceKm: distKm,
  tariff,
  riderShare,
  revShare: rs,
  onView,
  onAccept,
  onReject,
}: OfferCardProps) {
  return (
    <Card className="border-primary/40 hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{d.order_reference || d.id.slice(0, 8)}</p>
            {d.merchants?.name && <p className="text-xs text-muted-foreground truncate">{d.merchants.name}</p>}
          </div>
          <Button variant="ghost" size="icon" aria-label={`View offer ${d.order_reference || d.id.slice(0, 8)}`} onClick={() => onView(d)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="text-sm space-y-1.5">
          <div className="flex items-start gap-2">
            <div className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" aria-hidden="true" />
            <div><p className="text-xs text-muted-foreground">Pickup</p><p>{d.pickup_address}</p></div>
          </div>
          <div className="flex items-start gap-2">
            <div className="mt-1 h-2 w-2 rounded-full bg-destructive shrink-0" aria-hidden="true" />
            <div><p className="text-xs text-muted-foreground">Drop-off</p><p>{d.dropoff_address}</p></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded-md bg-muted flex items-center gap-1 tabular-nums"><Ruler className="h-3 w-3" aria-hidden="true" />{distKm != null ? `${distKm} km` : '—'}</span>
          {tariff > 0 && <span className="px-2 py-1 rounded-md bg-muted flex items-center gap-1 tabular-nums"><DollarSign className="h-3 w-3" aria-hidden="true" />D{tariff.toFixed(2)}</span>}
          {riderShare != null && rs && (
            <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-medium tabular-nums">
              D{riderShare.toFixed(2)} ({Number(rs.rider_percentage)}%)
            </span>
          )}
          {/* NOTE: payout is tabular-nums, lucide icons only, no emoji */}
        </div>
        {rs && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground border-t pt-2">
            <span>Rider</span><span className="text-right tabular-nums">{Number(rs.rider_percentage)}%</span>
            <span>Merchant</span><span className="text-right tabular-nums">{Number(rs.merchant_percentage)}%</span>
            <span>UCS Rides</span><span className="text-right tabular-nums">{Number(rs.ucs_rides_percentage)}%</span>
            <span>Platform</span><span className="text-right tabular-nums">{Number(rs.platform_percentage)}%</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {riderShare != null && rs
            ? `Accept assigns this Delivery to you at D${riderShare.toFixed(2)} (${Number(rs.rider_percentage)}%).`
            : 'Accept assigns this Delivery to you.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => onAccept(d)} className="flex-1 min-h-[44px]" size="sm">
            <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />Accept
          </Button>
          <Button onClick={() => onReject(d)} variant="destructive" className="flex-1 min-h-[44px]" size="sm">
            <Square className="h-4 w-4 mr-2" aria-hidden="true" />Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
