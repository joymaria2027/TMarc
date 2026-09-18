/**
 * Server-side rider search helpers (DeliveriesPage tracer).
 *
 * The page debounces free text and pushes it into the PostgREST query via
 * `buildRiderSearchOr` + a profiles/riders join, additive with the existing
 * delivery search. Empty query = passthrough (today's behavior exactly).
 */

/** Rider columns covered by the server-side ilike filter. */
export const RIDER_SEARCH_COLUMNS = [
  "profiles.full_name",
  "profiles.email",
  "riders.license_plate",
] as const;

/** Trimmed query; blank/null/undefined collapse to "" (unfiltered). */
export function normalizeRiderSearchQuery(query: string | null | undefined): string {
  return (query ?? "").trim();
}

/** True when the query should constrain the server query. */
export function isRiderSearchActive(query: string | null | undefined): boolean {
  return normalizeRiderSearchQuery(query).length > 0;
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
 * Build the PostgREST `or()` filter for an active rider search, or null when
 * the query is empty (caller must skip `.or()` so unfiltered behavior is
 * byte-identical). Requires a nested join:
 * `riders(license_plate, profiles(full_name, email))`.
 */
export function buildRiderSearchOr(
  query: string | null | undefined,
): string | null {
  const q = normalizeRiderSearchQuery(query);
  if (!q) return null;
  const pattern = `*${escapePostgrestLikePattern(q)}*`;
  const parts = RIDER_SEARCH_COLUMNS.map((col) => `${col}.ilike.${pattern}`);
  return parts.join(",");
}

export interface RiderSearchCandidate {
  /** Nested join from deliveries → riders → profiles (server rows). */
  riders?: {
    license_plate: string | null;
    profiles?: {
      full_name: string;
      email: string;
    } | null;
  } | null;
  /** Flat projections for convenience (server rows only). */
  rider_license_plate?: string | null;
  rider_full_name?: string | null;
  rider_email?: string | null;
}

/**
 * Client-side gate for realtime INSERT/UPDATE rows while a rider search is
 * active: checks rider name/email/license_plate. Empty query matches everything.
 * Realtime payloads may carry the nested join or flat projections.
 */
export function rowMatchesRiderSearch(
  row: RiderSearchCandidate,
  query: string | null | undefined,
): boolean {
  const q = normalizeRiderSearchQuery(query).toLowerCase();
  if (!q) return true;

  const licensePlate =
    row.rider_license_plate ??
    row.riders?.license_plate ??
    null;
  const fullName =
    row.rider_full_name ??
    row.riders?.profiles?.full_name ??
    null;
  const email =
    row.rider_email ??
    row.riders?.profiles?.email ??
    null;

  return [licensePlate, fullName, email].some(
    (v) => v?.toLowerCase().includes(q) ?? false,
  );
}