import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { PostgrestError } from '@supabase/supabase-js';

type Functions = Database['public']['Functions'];

// ---------------------------------------------------------------------------
// Typed RPC returns (single source of truth for delivery + wallet RPC shapes).
// Call sites must use these instead of `as any` casts on rpc data.
// ---------------------------------------------------------------------------

/** Masked unassigned pool for riders. NOTE: not yet in generated Database
 * types, so this mirrors the deliveries row shape until types are regenerated. */
export type UnassignedDeliveryRow = Functions['get_offered_deliveries']['Returns'][number];

/** Broadcast offers declined by another rider. */
export type OfferedDeliveryRow = Functions['get_offered_deliveries']['Returns'][number];

/** Deliveries the current rider personally rejected (SECURITY DEFINER RPC). */
export type RiderRejectedDeliveryRow = Functions['get_rider_rejected_deliveries']['Returns'][number];

export type ClaimDeliveryResult = Functions['claim_delivery']['Returns'];
export type ReclaimDeliveryResult = Functions['reclaim_delivery']['Returns'];
export type RejectDeliveryResult = Functions['reject_delivery']['Returns'];
export type CancelDeliveryAcceptanceResult = Functions['cancel_delivery_acceptance']['Returns'];
export type HasWithdrawalPinResult = Functions['has_withdrawal_pin']['Returns'];
export type VerifyWithdrawalPinResult = Functions['verify_withdrawal_pin']['Returns'];
export type SetWithdrawalPinResult = Functions['set_withdrawal_pin']['Returns'];

// ---------------------------------------------------------------------------
// Thin typed wrappers: preserve supabase { data, error } passthrough so call
// sites keep their toast/optimistic flows, minus the `as any` casts.
// ---------------------------------------------------------------------------

export function rpcGetOfferedDeliveries() {
  return supabase.rpc('get_offered_deliveries');
}

export function rpcGetRiderRejectedDeliveries() {
  return supabase.rpc('get_rider_rejected_deliveries');
}

export function rpcGetUnassignedDeliveriesForRider(): Promise<{
  data: UnassignedDeliveryRow[] | null;
  error: PostgrestError | null;
}> {
  // Single centralized cast: the RPC exists in the database but is missing
  // from generated types. Regenerate types to drop this.
  const call = supabase.rpc as unknown as (
    fn: 'get_unassigned_deliveries_for_rider',
  ) => Promise<{ data: UnassignedDeliveryRow[] | null; error: PostgrestError | null }>;
  return call('get_unassigned_deliveries_for_rider');
}

export function rpcClaimDelivery(deliveryId: string) {
  return supabase.rpc('claim_delivery', { _delivery_id: deliveryId });
}

export function rpcReclaimDelivery(deliveryId: string) {
  return supabase.rpc('reclaim_delivery', { _delivery_id: deliveryId });
}

export function rpcRejectDelivery(deliveryId: string, reason?: string | null) {
  return supabase.rpc('reject_delivery', { _delivery_id: deliveryId, _reason: reason ?? null });
}

export function rpcCancelDeliveryAcceptance(deliveryId: string, reason?: string | null) {
  return supabase.rpc('cancel_delivery_acceptance', { _delivery_id: deliveryId, _reason: reason ?? null });
}

export function rpcHasWithdrawalPin() {
  return supabase.rpc('has_withdrawal_pin');
}

export function rpcVerifyWithdrawalPin(pin: string) {
  return supabase.rpc('verify_withdrawal_pin', { _pin: pin });
}

export function rpcSetWithdrawalPin(pin: string) {
  return supabase.rpc('set_withdrawal_pin', { _pin: pin });
}
