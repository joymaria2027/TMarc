import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { pageRange } from '@/lib/pagination';
import {
  buildDeliverySearchOr,
  escapePostgrestLikePattern,
  normalizeDeliverySearchQuery,
} from '@/lib/deliverySearch';

export type DeliveryRow = Database['public']['Tables']['deliveries']['Row'] & {
  merchants?: { name: string } | null;
  /**
   * Flat merchant name projected from the `merchants(name)` join (null when
   * unjoined/unknown). The table renders `merchants?.name ?? '–'`; this flat
   * field is the search contract. Realtime payloads carry no join, so patched
   * rows omit it — treat absent as unknown, never as "no merchant".
   */
  merchant_name: string | null;
};

/** Deliveries plus the merchant-name join (also fixes the table's "–" column). */
const DELIVERIES_WITH_MERCHANT_SELECT = '*, merchants(name)';

/** Raw join shape: PostgREST may return the many-to-one embed as an array. */
type JoinedDeliveryRow = Omit<DeliveryRow, 'merchants' | 'merchant_name'> & {
  merchants?: { name: string } | Array<{ name: string }> | null;
};

/** Normalize the join embed to `merchants` + flat `merchant_name`. */
function withMerchantName(row: JoinedDeliveryRow): DeliveryRow {
  const joined = Array.isArray(row.merchants) ? (row.merchants[0] ?? null) : (row.merchants ?? null);
  return { ...row, merchants: joined, merchant_name: joined?.name ?? null };
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
  client?: QueryClient;
}

/** Server-paginated deliveries, newest first. Replaces full-table select + client slice. */
export async function fetchDeliveriesPage({
  status = 'all',
  page = 1,
  pageSize = 20,
  search = '',
  merchantIds = [],
  client = supabase,
}: DeliveriesPageParams = {}): Promise<DeliveryRow[]> {
  const { from, to } = pageRange(page, pageSize);
  let query = client.from('deliveries').select(DELIVERIES_WITH_MERCHANT_SELECT).order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);
  const searchFilter = buildDeliverySearchOr(search, merchantIds);
  if (searchFilter) query = query.or(searchFilter);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return ((data ?? []) as JoinedDeliveryRow[]).map(withMerchantName);
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
    .select(DELIVERIES_WITH_MERCHANT_SELECT)
    .in('status', ['unassigned', 'pending'])
    .is('rider_id', null)
    .order('created_at', { ascending: false });
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return ((data ?? []) as JoinedDeliveryRow[]).map(withMerchantName);
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
  client = supabase,
}: {
  status?: string;
  search?: string;
  merchantIds?: string[];
  client?: QueryClient;
} = {}): Promise<number> {
  let query = client.from('deliveries').select('*', { count: 'exact', head: true });
  if (status !== 'all') query = query.eq('status', status);
  const searchFilter = buildDeliverySearchOr(search, merchantIds);
  if (searchFilter) query = query.or(searchFilter);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
