import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronsUpDown, Eye, Flag, FlagOff, MapPin, Package, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DeliveryRow } from "@/lib/queries/deliveries";
import {
  deliveryClaimLabel,
  deliveryDeleteLabel,
  deliveryFlagLabel,
  deliveryShortRef,
  deliveryStatusMeta,
  deliveryUnflagLabel,
  deliveryViewLabel,
  formatTariff,
  sortDeliveries,
} from "@/lib/deliveries";
import type { DeliverySortKey, DeliverySortState } from "@/lib/deliveries";

export interface DeliveriesTableProps {
  unassignedRows: DeliveryRow[];
  mainRows: DeliveryRow[];
  /** Delivery id from `?highlight=`; matching row gets ring highlight + scroll. */
  highlightId: string | null;
  isRider: boolean;
  canDelete: boolean;
  rejectionCounts: Record<string, number>;
  hasMore: boolean;
  hasMoreUnassigned: boolean;
  onView: (delivery: DeliveryRow) => void;
  onFlag: (id: string) => void;
  onUnflag: (id: string) => void;
  onDelete: (id: string) => void;
  onClaim: (delivery: DeliveryRow) => void;
  onShowMore: () => void;
  onShowMoreUnassigned: () => void;
}

const COLUMN_COUNT = 8;

/** Row contract from the search agent: rows may carry a denormalized merchant_name. */
interface DeliveryMerchantNameRow {
  merchant_name?: string | null;
}

function merchantDisplayName(d: DeliveryRow & DeliveryMerchantNameRow): string {
  return d.merchant_name ?? d.merchants?.name ?? "–";
}

/**
 * Sortable column header. Three-state cycle (asc → desc → default) owned by the
 * table; the full cell is clickable via a full-width 44px button.
 */
function SortableHead({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
}: {
  label: string;
  sortKey: DeliverySortKey;
  sort: DeliverySortState | null;
  onToggle: (key: DeliverySortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  const ariaSort: "none" | "ascending" | "descending" = !active
    ? "none"
    : sort.dir === "asc"
      ? "ascending"
      : "descending";
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  const stateLabel = !active ? "" : sort.dir === "asc" ? ", sorted ascending" : ", sorted descending";
  return (
    <TableHead aria-sort={ariaSort} className="p-0">
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`Sort by ${label}${stateLabel}`}
        className={`flex min-h-[44px] w-full items-center gap-1 px-4 text-left font-medium text-muted-foreground transition-colors hover:text-foreground ${
          align === "right" ? "justify-end" : "justify-start"
        }`}
      >
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function DeliveryRowCells({
  delivery,
  isHighlighted,
  showClaim,
  isRider,
  canDelete,
  rejectionCount,
  onView,
  onFlag,
  onUnflag,
  onDelete,
  onClaim,
}: {
  delivery: DeliveryRow;
  isHighlighted: boolean;
  showClaim: boolean;
  isRider: boolean;
  canDelete: boolean;
  rejectionCount: number;
  onView: (delivery: DeliveryRow) => void;
  onFlag: (id: string) => void;
  onUnflag: (id: string) => void;
  onDelete: (id: string) => void;
  onClaim: (delivery: DeliveryRow) => void;
}) {
  const d = delivery;
  const ref = deliveryShortRef(d);
  const status = deliveryStatusMeta(d.status);
  const StatusIcon = status.icon;
  const tariff = formatTariff(d.estimated_tariff);

  return (
    <TableRow
      data-delivery-id={d.id}
      className={isHighlighted ? "ring-2 ring-primary bg-primary/5" : undefined}
    >
      <TableCell>
        <p className="font-medium text-sm">{ref}</p>
        <p className="text-xs text-muted-foreground truncate max-w-xs flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {d.pickup_address} → {d.dropoff_address}
          </span>
        </p>
        {rejectionCount > 0 && (
          <Badge variant="outline" className="text-destructive border-destructive/30 mt-1">
            Rejected by {rejectionCount} rider{rejectionCount === 1 ? "" : "s"}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {d.merchant_id ? (
          <Link
            to={`/merchants?highlight=${encodeURIComponent(d.merchant_id)}`}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {merchantDisplayName(d)}
          </Link>
        ) : (
          <span className="text-sm">{merchantDisplayName(d)}</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {d.rider_id ? `Rider ${d.rider_id.slice(0, 8)}` : "Unassigned"}
        </span>
      </TableCell>
      <TableCell>
        <Badge className={`${status.badgeClassName} gap-1`}>
          <StatusIcon className="h-3 w-3" aria-hidden="true" />
          {status.label}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="text-sm font-medium">{tariff ?? "–"}</span>
        {d.actual_distance_km ? (
          <span className="block text-xs text-muted-foreground tabular-nums">{d.actual_distance_km} km</span>
        ) : null}
      </TableCell>
      <TableCell>
        {d.is_flagged || d.route_deviation_detected ? (
          <span className="flex flex-wrap gap-1">
            {d.is_flagged && (
              <Badge variant="destructive" className="gap-1">
                <Flag className="h-3 w-3" aria-hidden="true" />
                Flagged
              </Badge>
            )}
            {d.route_deviation_detected && (
              <Badge className="bg-warning/15 text-warning-foreground border-warning/30">Deviation</Badge>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </TableCell>
      <TableCell className="tabular-nums whitespace-nowrap">
        <time dateTime={d.updated_at} className="text-xs text-muted-foreground">
          {format(new Date(d.updated_at), "MMM d, HH:mm")}
        </time>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={deliveryViewLabel(d)} onClick={() => onView(d)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
          </Button>
          {d.is_flagged ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={deliveryUnflagLabel(d)}
              onClick={() => onUnflag(d.id)}
            >
              <FlagOff className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              aria-label={deliveryFlagLabel(d)}
              onClick={() => onFlag(d.id)}
            >
              <Flag className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={deliveryDeleteLabel(d)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete delivery {ref}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the delivery and all related waypoints, receipts, alerts,
                    rejections, settlement records, and reconciliation entries. Wallet transactions remain but
                    will no longer link to this delivery. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(d.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {showClaim && isRider && (
            <Button size="sm" onClick={() => onClaim(d)} aria-label={deliveryClaimLabel(d)}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Claim
            </Button>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}

/**
 * Dense queue table replacing the legacy card lists. Presentational only:
 * row-shape mapping and data actions live in DeliveriesPage.
 */
export default function DeliveriesTable(props: DeliveriesTableProps) {
  const {
    unassignedRows,
    mainRows,
    highlightId,
    hasMore,
    hasMoreUnassigned,
    onShowMore,
    onShowMoreUnassigned,
  } = props;
  const tableRef = useRef<HTMLTableElement>(null);
  const scrolledHighlightRef = useRef<string | null>(null);

  // Sort state lives inside the table; null = rows as received (newest first).
  const [sort, setSort] = useState<DeliverySortState | null>(null);
  const toggleSort = (key: DeliverySortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const sortedUnassigned = useMemo(
    () => sortDeliveries(unassignedRows, sort),
    [unassignedRows, sort],
  );
  const sortedMain = useMemo(() => sortDeliveries(mainRows, sort), [mainRows, sort]);

  // Deep-link contract: scroll the highlighted row into view on mount (once per id).
  useEffect(() => {
    if (!highlightId || scrolledHighlightRef.current === highlightId) return;
    const el = tableRef.current?.querySelector(`[data-delivery-id="${CSS.escape(highlightId)}"]`);
    if (el instanceof HTMLElement) {
      scrolledHighlightRef.current = highlightId;
      el.scrollIntoView({ block: "center" });
    }
  }, [highlightId, unassignedRows, mainRows]);

  const cellProps = (d: DeliveryRow, section: "unassigned" | "main") => ({
    delivery: d,
    isHighlighted: highlightId !== null && d.id === highlightId,
    showClaim: section === "unassigned",
    isRider: props.isRider,
    canDelete: props.canDelete,
    rejectionCount: props.rejectionCounts[d.id] || 0,
    onView: props.onView,
    onFlag: props.onFlag,
    onUnflag: props.onUnflag,
    onDelete: props.onDelete,
    onClaim: props.onClaim,
  });

  return (
    <Table ref={tableRef}>
      <TableHeader>
        <TableRow>
          <TableHead>Reference</TableHead>
          <TableHead>Merchant</TableHead>
          <TableHead>Rider</TableHead>
          <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
          <SortableHead label="Tariff" sortKey="tariff" sort={sort} onToggle={toggleSort} align="right" />
          <TableHead>Flag</TableHead>
          <SortableHead label="Updated" sortKey="time" sort={sort} onToggle={toggleSort} />
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody aria-label="Unassigned deliveries">
        {unassignedRows.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT}>
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg text-xs">
                All deliveries currently assigned.
              </div>
            </TableCell>
          </TableRow>
        )}
        {sortedUnassigned.map((d) => (
          <DeliveryRowCells key={d.id} {...cellProps(d, "unassigned")} />
        ))}
        {hasMoreUnassigned && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT}>
              <Button variant="outline" size="sm" className="w-full" onClick={onShowMoreUnassigned}>
                Show more unassigned
              </Button>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      <TableBody aria-label="Assigned deliveries">
        {sortedMain.map((d) => (
          <DeliveryRowCells key={d.id} {...cellProps(d, "main")} />
        ))}
        {hasMore && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT}>
              <Button variant="outline" className="w-full" onClick={onShowMore}>
                Show more
              </Button>
            </TableCell>
          </TableRow>
        )}
        {mainRows.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMN_COUNT}>
              <div className="text-center py-10 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-50" aria-hidden="true" />
                <p>No deliveries found</p>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
