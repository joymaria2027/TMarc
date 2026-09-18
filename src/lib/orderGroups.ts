export type OrderTab = "all" | "active" | "past";

const ACTIVE_STATUSES = new Set([
  "pending_payment",
  "paid",
  "accepted",
  "preparing",
  "ready",
  "dispatched",
  "picked_up",
  "in_transit",
]);

export function isActiveOrder(status?: string | null): boolean {
  if (!status) return true;
  return ACTIVE_STATUSES.has(status.toLowerCase());
}

export interface FilterableOrder {
  status?: string | null;
  order_reference?: string | null;
  merchants?: { name?: string | null } | null;
}

export function filterOrders<T extends FilterableOrder>(
  orders: T[],
  opts: { tab: OrderTab; query: string }
): T[] {
  const q = opts.query.trim().toLowerCase();
  return orders.filter((o) => {
    if (opts.tab === "active" && !isActiveOrder(o.status ?? undefined)) return false;
    if (opts.tab === "past" && isActiveOrder(o.status ?? undefined)) return false;
    if (!q) return true;
    const ref = (o.order_reference ?? "").toLowerCase();
    const merchant = (o.merchants?.name ?? "").toLowerCase();
    return ref.includes(q) || merchant.includes(q);
  });
}
