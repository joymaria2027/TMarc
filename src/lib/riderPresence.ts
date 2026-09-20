import { supabase } from '@/integrations/supabase/client';

type SupabaseClient = typeof supabase;

/**
 * Rider presence (ticket: any rider signed in is automatically online).
 *
 * Single home for the `riders.is_online / is_active` writes that were
 * previously duplicated across RiderDashboard, RejectedDeliveriesPage, and
 * useGpsTracking. Sign-in marks online+active by user_id (0-row no-op for
 * non-riders); sign-out marks offline by user_id, leaving is_active alone.
 * All helpers are fire-and-forget safe: empty ids no-op, errors propagate to
 * the caller (useAuth swallows them so presence never blocks auth UI).
 */
export async function markRiderOnlineByUserId(
  userId: string | null | undefined,
  client: SupabaseClient = supabase,
) {
  if (!userId) return;
  await client.from('riders').update({ is_online: true, is_active: true }).eq('user_id', userId);
}

export async function markRiderOfflineByUserId(
  userId: string | null | undefined,
  client: SupabaseClient = supabase,
) {
  if (!userId) return;
  await client.from('riders').update({ is_online: false }).eq('user_id', userId);
}

export async function markRiderOnlineByRiderId(
  riderId: string | null | undefined,
  client: SupabaseClient = supabase,
) {
  if (!riderId) return;
  await client.from('riders').update({ is_online: true, is_active: true }).eq('id', riderId);
}

export async function markRiderOfflineByRiderId(
  riderId: string | null | undefined,
  client: SupabaseClient = supabase,
) {
  if (!riderId) return;
  await client.from('riders').update({ is_online: false }).eq('id', riderId);
}
