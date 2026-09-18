import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { pageRange } from '@/lib/pagination';

export type DeliveryRow = Database['public']['Tables']['deliveries']['Row'] & {
  merchants?: { name: string } | null;
};

type QueryClient = typeof supabase;

export interface DeliveriesPageParams {
  /** Delivery status filter; 'all' skips the eq clause. */
  status?: string;
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  client?: QueryClient;
}

/** Server-paginated deliveries, newest first. Replaces full-table select + client slice. */
export async function fetchDeliveriesPage({
  status = 'all',
  page = 1,
  pageSize = 20,
  client = supabase,
}: DeliveriesPageParams = {}): Promise<DeliveryRow[]> {
  const { from, to } = pageRange(page, pageSize);
  let query = client.from('deliveries').select('*').order('created_at', { ascending: false });
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return (data ?? []) as DeliveryRow[];
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
    .select('*')
    .in('status', ['unassigned', 'pending'])
    .is('rider_id', null)
    .order('created_at', { ascending: false });
  if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return (data ?? []) as DeliveryRow[];
}

/** Exact count for the same filter (drives hasMore / page controls). */
export async function fetchDeliveriesCount({
  status = 'all',
  client = supabase,
}: {
  status?: string;
  client?: QueryClient;
} = {}): Promise<number> {
  let query = client.from('deliveries').select('*', { count: 'exact', head: true });
  if (status !== 'all') query = query.eq('status', status);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
