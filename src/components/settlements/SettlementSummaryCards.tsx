import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label="Settlement summary">
        <caption className="sr-only">Settlement summary totals</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Deliveries</TableHead>
            <TableHead className="text-right">Total revenue</TableHead>
            <TableHead>Approved</TableHead>
            <TableHead>Merchants</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="text-3xl tabular-nums">{totalDeliveries}</TableCell>
            <TableCell className="text-right text-3xl tabular-nums">D{totalRevenue.toFixed(2)}</TableCell>
            <TableCell className="text-3xl tabular-nums text-accent">{approvedCount}</TableCell>
            <TableCell className="text-3xl tabular-nums">{merchantCount}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
