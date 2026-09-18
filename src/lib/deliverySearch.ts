/**
 * Server-side delivery search helpers (DeliveriesPage tracer).
 *
 * The page debounces free text (`useDebouncedValue`) and pushes it into the
 * PostgREST query via `buildDeliverySearchOr` + a merchant-id lookup, instead
 * of filtering loaded pages on the client. Rider-name search is deliberately
 * OUT (it needs a profiles join — follow-up).
 */

/** Delivery columns covered by the server-side ilike filter. */
export const DELIVERY_SEARCH_COLUMNS = ["order_reference", "pickup_address", "dropoff_address"] as const;

/** Trimmed query; blank/null/undefined collapse to "" (unfiltered). */
export function normalizeDeliverySearchQuery(query: string | null | undefined): string {
  return (query ?? "").trim();
}

/** True when the query should constrain the server query. */
export function isDeliverySearchActive(query: string | null | undefined): boolean {
  return normalizeDeliverySearchQuery(query).length > 0;
}

/**
 * Escape a user value for embedding in a PostgREST `ilike.*value*` pattern.
 * Escapes LIKE specials (`\` first, then `%`/`_`) and maps `,`, `(`, `)` —
 * which would corrupt the `or(a,b)` disjunct parsing — to the single-char
 * LIKE wildcard `_` (still matches the literal characters).
 */
export function escapePostgrestLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/[,()]/g, "_");
}

/**
 * Build the PostgREST `or()` filter for an active search, or null when the
 * query is empty (caller must skip `.or()` so unfiltered behavior is
 * byte-identical). Merchant-name matching arrives as `merchantIds` from a
 * `merchants.name ilike` lookup (see fetchMerchantIdsByName) and is OR-ed in
 * as `merchant_id.in.(…)` — realtime payloads carry no merchant join, so the
 * live patch gate (`rowMatchesDeliverySearch`) can only match delivery
 * columns in place; merchant-name matches arrive via the debounced refetch.
 */
export function buildDeliverySearchOr(
  query: string | null | undefined,
  merchantIds: string[] = [],
): string | null {
  const q = normalizeDeliverySearchQuery(query);
  if (!q) return null;
  const pattern = `*${escapePostgrestLikePattern(q)}*`;
  const parts = DELIVERY_SEARCH_COLUMNS.map((col) => `${col}.ilike.${pattern}`);
  if (merchantIds.length > 0) parts.push(`merchant_id.in.(${merchantIds.join(",")})`);
  return parts.join(",");
}

export interface DeliverySearchCandidate {
  order_reference: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  merchants?: { name: string } | null;
  /** Flat join projection (server rows); absent on realtime payloads. */
  merchant_name?: string | null;
}

/**
 * Client-side gate for realtime INSERT/UPDATE rows while a server search is
 * active: status is checked by the caller, this checks the search terms
 * (delivery columns always, merchant name when the row carries the join).
 * Empty query matches everything.
 */
export function rowMatchesDeliverySearch(
  row: DeliverySearchCandidate,
  query: string | null | undefined,
): boolean {
  const q = normalizeDeliverySearchQuery(query).toLowerCase();
  if (!q) return true;
  const merchantName = row.merchant_name ?? row.merchants?.name ?? null;
  return [row.order_reference, row.pickup_address, row.dropoff_address, merchantName].some(
    (v) => v?.toLowerCase().includes(q) ?? false,
  );
}

/** Result-count label: "N matching" while searching, "N deliveries" otherwise. */
export function describeDeliveryResultCount(
  count: number,
  query: string | null | undefined,
): string {
  return isDeliverySearchActive(query) ? `${count} matching` : `${count} deliveries`;
}
