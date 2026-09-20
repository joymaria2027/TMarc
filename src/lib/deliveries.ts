import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Navigation,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import type { DeliveryRow } from "@/lib/queries/deliveries";

/**
 * Pure row-mapping helpers for the deliveries queue table.
 * Extracted from DeliveriesPage so they are unit-testable; the page keeps
 * owning row-shape mapping by calling these (no behavior change).
 */

export interface DeliveryStatusMeta {
  /** Human-readable label, always paired with `icon` (never color-only). */
  label: string;
  /** Token-only badge classes (matches the legacy statusColor map). */
  badgeClassName: string;
  icon: LucideIcon;
}

const STATUS_META: Record<string, DeliveryStatusMeta> = {
  pending: {
    label: "Pending",
    badgeClassName: "bg-muted text-muted-foreground",
    icon: Clock,
  },
  unassigned: {
    label: "Unassigned",
    badgeClassName: "bg-warning/15 text-warning-foreground border-warning/30",
    icon: CircleDashed,
  },
  dispatched: {
    label: "Dispatched",
    badgeClassName: "bg-info/10 text-info border-info/20",
    icon: Truck,
  },
  accepted: {
    label: "Accepted",
    badgeClassName: "bg-success/10 text-success border-success/20",
    icon: CheckCircle2,
  },
  in_transit: {
    label: "In transit",
    badgeClassName: "bg-primary/10 text-primary border-primary/20",
    icon: Navigation,
  },
  delivered: {
    label: "Delivered",
    badgeClassName: "bg-accent/10 text-accent border-accent/20",
    icon: CheckCircle2,
  },
  cancelled: {
    label: "Cancelled",
    badgeClassName: "bg-destructive/10 text-destructive border-destructive/20",
    icon: XCircle,
  },
};

function titleCaseStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function deliveryStatusMeta(status: string): DeliveryStatusMeta {
  const meta = STATUS_META[status];
  if (meta) return meta;
  return {
    label: status ? titleCaseStatus(status) : "Unknown",
    badgeClassName: "bg-muted text-muted-foreground",
    icon: Package,
  };
}

/** Format a tariff as `D12.50`. Returns null when absent — mirrors the legacy
 *  truthy check (`d.estimated_tariff && ...`), so 0/NaN stay hidden. */
export function formatTariff(value: number | string | null | undefined): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `D${n.toFixed(2)}`;
}

export const MANUAL_FLAG_REASON = "Manually flagged by admin";

export interface FlagTogglePayload {
  is_flagged: boolean;
  flag_reason: string | null;
}

/** Supabase update payload for flag/unflag. Unflag clears the reason. */
export function flagPayload(flagged: boolean): FlagTogglePayload {
  return flagged
    ? { is_flagged: true, flag_reason: MANUAL_FLAG_REASON }
    : { is_flagged: false, flag_reason: null };
}

export type DeliverySearchRow = Pick<
  DeliveryRow,
  "id" | "order_reference" | "pickup_address" | "dropoff_address"
>;

/** Client-side search predicate — same fields as the legacy filter. */
export function matchesDeliverySearch(row: DeliverySearchRow, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    row.order_reference?.toLowerCase().includes(q) ||
    row.pickup_address?.toLowerCase().includes(q) ||
    row.dropoff_address?.toLowerCase().includes(q) ||
    row.id.toLowerCase().includes(q) ||
    false
  );
}

export type DeliveryAssignmentRow = Pick<DeliveryRow, "status" | "rider_id">;

/** Partition predicate for the unassigned pool (main list excludes these). */
export function isUnassignedRow(row: DeliveryAssignmentRow): boolean {
  return (row.status === "unassigned" || row.status === "pending") && !row.rider_id;
}

export type DeliveryRefRow = Pick<DeliveryRow, "id" | "order_reference">;

export function deliveryShortRef(row: DeliveryRefRow): string {
  return row.order_reference || row.id.slice(0, 8);
}

export function deliveryViewLabel(row: DeliveryRefRow): string {
  return `View delivery ${deliveryShortRef(row)}`;
}

export function deliveryFlagLabel(row: DeliveryRefRow): string {
  return `Flag delivery ${deliveryShortRef(row)}`;
}

export function deliveryUnflagLabel(row: DeliveryRefRow): string {
  return `Unflag delivery ${deliveryShortRef(row)}`;
}

export function deliveryDeleteLabel(row: DeliveryRefRow): string {
  return `Delete delivery ${deliveryShortRef(row)}`;
}

export function deliveryClaimLabel(row: DeliveryRefRow): string {
  return `Claim delivery ${deliveryShortRef(row)}`;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  wave: "Wave",
  qmoney: "QMoney",
  afrimoney: "Afrimoney",
  aps_wallet: "APS Wallet",
  bank_transfer: "Bank Transfer",
};

/** Matches the legacy detail-dialog wording (`Bank Transfer (X)` variant). */
export function paymentMethodLabel(
  method: string | null | undefined,
  bankName?: string | null,
): string {
  if (!method) return "–";
  if (method === "bank_transfer" && bankName) return `Bank Transfer (${bankName})`;
  return PAYMENT_METHOD_LABELS[method] || method;
}

/** Parse `?highlight=<deliveryId>` (via useSearchParams in the page).
 *  Blank/missing values resolve to null so unknown ids are ignored silently. */
export function parseHighlightId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

/** Sortable DeliveriesTable columns: Time → updated_at, Tariff → estimated_tariff, Status → status, Merchant → merchant_name/merchants.name, Rider → rider_id. */
export type DeliverySortKey = "time" | "tariff" | "status" | "merchant" | "rider";
export type DeliverySortDir = "asc" | "desc";

/** Active column sort. `null` (no state) means rows render as received. */
export interface DeliverySortState {
  key: DeliverySortKey;
  dir: DeliverySortDir;
}

/** Minimal row shape the sorter needs (DeliveryRow satisfies this). */
export interface DeliverySortRow {
  status: string;
  updated_at: string | null | undefined;
  estimated_tariff: number | string | null | undefined;
  merchant_id: string | null | undefined;
  merchant_name: string | null | undefined;
  merchants: { name: string } | null | undefined;
  rider_id: string | null | undefined;
}

/** Lifecycle order for the Status column (mirrors the queue's mental model). */
const STATUS_SORT_ORDER: readonly string[] = [
  "pending",
  "unassigned",
  "dispatched",
  "accepted",
  "in_transit",
  "delivered",
  "cancelled",
];

function statusRank(status: string): number {
  const i = STATUS_SORT_ORDER.indexOf(status);
  // Unknown statuses sort after every known one (ascending) — deterministic.
  return i === -1 ? STATUS_SORT_ORDER.length : i;
}

function timeValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function tariffValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function merchantNameValue(row: DeliverySortRow): string {
  return row.merchant_name ?? row.merchants?.name ?? "";
}

function riderIdValue(row: DeliverySortRow): string {
  return row.rider_id ?? "";
}

/** Pure column sort for the deliveries queue table. Null sort returns the rows
 *  as received; otherwise a stable ascending/descending ordering where missing
 *  values (null times/tariffs) sort last ascending, first descending —
 *  deterministic in both directions. Never mutates the input. */
export function sortDeliveries<T extends DeliverySortRow>(
  rows: T[],
  sort: DeliverySortState | null,
): T[] {
  if (!sort) return [...rows];
  const dir = sort.dir === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      let cmp: number;
      if (sort.key === "time") {
        const ta = timeValue(a.row.updated_at);
        const tb = timeValue(b.row.updated_at);
        if (ta === null && tb === null) cmp = 0;
        else if (ta === null) cmp = 1;
        else if (tb === null) cmp = -1;
        else cmp = ta - tb;
      } else if (sort.key === "tariff") {
        const ta = tariffValue(a.row.estimated_tariff);
        const tb = tariffValue(b.row.estimated_tariff);
        if (ta === null && tb === null) cmp = 0;
        else if (ta === null) cmp = 1;
        else if (tb === null) cmp = -1;
        else cmp = ta - tb;
      } else if (sort.key === "status") {
        cmp = statusRank(a.row.status) - statusRank(b.row.status);
      } else if (sort.key === "merchant") {
        const ma = merchantNameValue(a.row).toLowerCase();
        const mb = merchantNameValue(b.row).toLowerCase();
        if (ma === mb) cmp = 0;
        else if (ma === "") cmp = 1;
        else if (mb === "") cmp = -1;
        else cmp = ma.localeCompare(mb);
      } else {
        const ra = riderIdValue(a.row);
        const rb = riderIdValue(b.row);
        if (ra === rb) cmp = 0;
        else if (ra === "") cmp = 1;
        else if (rb === "") cmp = -1;
        else cmp = ra.localeCompare(rb);
      }
      if (cmp !== 0) return cmp * dir;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}
