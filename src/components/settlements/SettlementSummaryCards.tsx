import { Card, CardContent } from '@/components/ui/card';

interface SettlementSummaryCardsProps {
  totalDeliveries: number;
  totalRevenue: number;
  approvedCount: number;
  merchantCount: number;
}

export default function SettlementSummaryCards({
  totalDeliveries,
  totalRevenue,
  approvedCount,
  merchantCount,
}: SettlementSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card><CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Deliveries</p>
        <p className="text-3xl tabular-nums mt-1">{totalDeliveries}</p>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Revenue</p>
        <p className="text-3xl tabular-nums mt-1">D{totalRevenue.toFixed(2)}</p>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Approved</p>
        <p className="text-3xl tabular-nums mt-1 text-accent">{approvedCount}</p>
      </CardContent></Card>
      <Card><CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Merchants</p>
        <p className="text-3xl tabular-nums mt-1">{merchantCount}</p>
      </CardContent></Card>
    </div>
  );
}
