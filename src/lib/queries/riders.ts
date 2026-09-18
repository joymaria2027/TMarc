import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { pageRange } from '@/lib/pagination';

export type RiderRow = Database['public']['Tables']['riders']['Row'];

type QueryClient = typeof supabase;

export interface RidersPageParams {
  page?: number;
  pageSize?: number;
  /** When true, only active riders (drives the GPS tracker list). */
  activeOnly?: boolean;
  client?: QueryClient;
}

/** Server-paginated riders, newest first. Replaces full-table select + client slice. */
export async function fetchRidersPage({
  page = 1,
  pageSize = 20,
  activeOnly = false,
  client = supabase,
}: RidersPageParams = {}): Promise<RiderRow[]> {
  const { from, to } = pageRange(page, pageSize);
  let query = client.from('riders').select('*').order('created_at', { ascending: false });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return (data ?? []) as RiderRow[];
}

/** Exact count for the same filter (drives hasMore / page controls). */
export async function fetchRidersCount({
  activeOnly = false,
  client = supabase,
}: {
  activeOnly?: boolean;
  client?: QueryClient;
} = {}): Promise<number> {
  let query = client.from('riders').select('*', { count: 'exact', head: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
