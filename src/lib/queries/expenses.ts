import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { pageRange } from '@/lib/pagination';

export type ExpenseRow = Database['public']['Tables']['rider_expenses']['Row'];

type QueryClient = typeof supabase;

export interface ExpensesPageParams {
  page?: number;
  pageSize?: number;
  /** When set, scope to one rider's expenses. */
  riderId?: string | null;
  client?: QueryClient;
}

/** Server-paginated rider expenses, newest first. Replaces full-table select + client slice. */
export async function fetchExpensesPage({
  page = 1,
  pageSize = 20,
  riderId = null,
  client = supabase,
}: ExpensesPageParams = {}): Promise<ExpenseRow[]> {
  const { from, to } = pageRange(page, pageSize);
  let query = client.from('rider_expenses').select('*').order('created_at', { ascending: false });
  if (riderId) query = query.eq('rider_id', riderId);
  const { data, error } = await query.range(from, to);
  if (error) throw error;
  return (data ?? []) as ExpenseRow[];
}

/** Exact count for the same filter (drives hasMore / page controls). */
export async function fetchExpensesCount({
  riderId = null,
  client = supabase,
}: {
  riderId?: string | null;
  client?: QueryClient;
} = {}): Promise<number> {
  let query = client.from('rider_expenses').select('*', { count: 'exact', head: true });
  if (riderId) query = query.eq('rider_id', riderId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
