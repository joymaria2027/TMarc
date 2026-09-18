import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { pageRange } from '@/lib/pagination';
import {
  buildDeliverySearchOr,
  escapePostgrestLikePattern,
  normalizeDeliverySearchQuery,
} from '@/lib/deliverySearch';
import {
  buildRiderSearchOr,
  normalizeRiderSearchQuery,
} from '@/lib/deliveryRiderSearch';

export type DeliveryRow = Database['public']['Tables']['deliveries']['Row'] & {
  merchants?: { name: string } | null;
  /**
   * Flat merchant name projected from the `merchants(name)` join (null when
   * unjoined/unknown). The table renders `merchants?.name ?? '–'`; this flat
   * field is the search contract. Realtime payloads carry no join, so patched
   * rows omit it — treat absent as unknown, never as "no merchant".
   */
  merchant_name: string | null;
  /**
   * Nested rider join for rider-name search (server rows only).
   * Shape: { license_plate: string | null; profiles?: { full_name: string; email: string } | null }
   */
  riders?: {
    license_plate: string | null;
    profiles?: { full_name: string; email: string } | null;
  } | null;
  /** Flat rider projections for convenience (server rows only). */
  rider_license_plate?: string | null;
  rider_full_name?: string | null;
  rider_email?: string | null;
};

/** Deliveries plus the merchant-name join + rider join for rider search. */
const DELIVERIES_WITH_MERCHANT_AND_RIDER_SELECT =
  '*, merchants(name), riders(license_plate, profiles(full_name, email))';

/** Raw join shape: PostgREST may return the many-to-one embed as an array. */
type JoinedDeliveryRow = Omit<DeliveryRow, 'merchants' | 'merchant_name' | 'riders'> & {
  merchants?: { name: string } | Array<{ name: string }> | null;
  riders?:
    | {
        license_plate: string | null;
        profiles?: { full_name: string; email: string } | null;
      }
    | Array<{
        license_plate: string | null;
        profiles?: { full_name: string; email: string } | null;
      }>
    | null;
};

/** Normalize the join embeds to flat fields. */
function withMerchantAndRiderName(row: JoinedDeliveryRow): DeliveryRow {
  const joinedMerchant = Array.isArray(row.merchants)
    ? row.merchants[0] ?? null
    : row.merchants ?? null;
  const joinedRider = Array.isArray(row.riders) ? row.riders[0] ?? null : row.riders ?? null;
  return {
    ...row,
    merchants: joinedMerchant,
    merchant_name: joinedMerchant?.name ?? null,
    riders: joinedRider,
    rider_license_plate: joinedRider?.license_plate ?? null,
    rider_full_name: joinedRider?.profiles?.full_name ?? null,
    rider_email: joinedRider?.profiles?.email ?? null,
  };
}

type QueryClient = typeof supabase;

export interface DeliveriesPageParams {
  /** Delivery status filter; 'all' skips the eq clause. */
  status?: string;
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /**
   * Server search (ilike over order_reference/pickup_address/dropoff_address,
   * OR-ed with `merchantIds`). Empty/blank skips `.or()` entirely so the
   * unfiltered query is byte-identical to before.
   */
  search?: string;
  /** Merchant ids matching the search (merchant-name OR branch). */
  merchantIds?: string[];
  /**
   * Rider search (ilike over profiles.full_name, profiles.email, riders.license_plate).
   * Empty/blank skips the rider branch entirely so the unfiltered query is
   * byte-identical to before. Applied additively with `search`.
   */
  riderSearch?: string;
  client?: QueryClient;
}

/** Server-paginated deliveries, newest first. Replaces full-table select + client slice. */
export async function fetchDeliveriesPage({
  status = 'all',
  page = 1,
  pageSize = 20,
  search = '',
  merchantIds = [],
  riderSearch = '',
  client = supabase,
}: DeliveriesPageParams = {}): Promise<DeliveryRow[]> {
  const { from, to } = pageRange(page, pageSize);
  let query = client
    .from('deliveries')
    .select(DELIVERIES_WITH_MERCHANT_AND_RIDER_SELECT)
    .order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);

  const deliveryFilter = buildDeliverySearchOr(search, merchantIds);
  const riderFilter = buildRiderSearchOr(riderSearch);

  // Combine filters additively: both must match if both are present.
  // PostgREST `or()` combines with OR, so we need AND logic.
  // We apply delivery filter first, then rider filter as a second .or().
  // This works because .or() is additive (AND) when chained.
  if (deliveryFilter) query = query.or(deliveryFilter);
  if (riderFilter) query = query.or(riderFilter);

  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return ((data ?? []) as JoinedDeliveryRow[]).map(withMerchantAndRiderName);
}

export interface UnassignedPageParams {
  page?: number;
  pageSize?: number;
  /** Delivery ids to exclude (e.g. already rejected by this rider). */
  excludeIds?: string[];
  client?: QueryClient;
}

/** Unassigned/pending pool with no rider, newest first. */
export async function fetchUnassignedPage({
  page = 1,
  pageSize = 20,
  excludeIds = [],
  client = supabase,
}: UnassignedPageParams = {}): Promise<DeliveryRow[]> {
  const { from, to } = pageRange(page, pageSize);
  let query = client
    .from('deliveries')
    .select(DELIVERIES_WITH_MERCHANT_AND_RIDER_SELECT)
    .in('status', ['unassigned', 'pending'])
    .is('rider_id', null)
    .order('created_at', { ascending: false });
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return ((data ?? []) as JoinedDeliveryRow[]).map(withMerchantAndRiderName);
}

/**
 * Merchant ids whose name matches the search (ilike). Feeds the
 * `merchant_id.in.(…)` OR branch of the deliveries query. Returns [] without
 * touching the client for empty queries.
 */
export async function fetchMerchantIdsByName({
  name,
  client = supabase,
}: {
  name: string;
  client?: QueryClient;
}): Promise<string[]> {
  const q = normalizeDeliverySearchQuery(name);
  if (!q) return [];
  const { data, error } = await client
    .from('merchants')
    .select('id')
    .ilike('name', `%${escapePostgrestLikePattern(q)}%`);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/** Exact count for the same filter (drives hasMore / page controls). */
export async function fetchDeliveriesCount({
  status = 'all',
  search = '',
  merchantIds = [],
  riderSearch = '',
  client = supabase,
}: {
  status?: string;
  search?: string;
  merchantIds?: string[];
  riderSearch?: string;
  client?: QueryClient;
} = {}): Promise<number> {
  let query = client.from('deliveries').select('*', { count: 'exact', head: true });
  if (status !== 'all') query = query.eq('status', status);
  const deliveryFilter = buildDeliverySearchOr(search, merchantIds);
  const riderFilter = buildRiderSearchOr(riderSearch);
  if (deliveryFilter) query = query.or(deliveryFilter);
  if (riderFilter) query = query.or(riderFilter);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}