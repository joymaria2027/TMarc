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

// Handover code RPCs ship in migration 20260920000004; generated types do not
// include them yet, so these mirror the migration signatures until a
// regeneration (cast `as never` per the established get_unassigned pattern).
// Returns stay explicit because call sites branch on them.
export type VerifyHandoverCodeResult = boolean;
export type GetMyHandoverCodeResult = number | null;

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
  // NOTE: must stay a method call on `supabase` (`supabase.rpc(...)`), never
  // detached (`const call = supabase.rpc; call(...)`) — postgrest-js reads
  // `this.rest` internally, so a detached call throws `can't access property
  // "rest", this is undefined` and whitescreens the awaiting pages.
  return supabase.rpc('get_unassigned_deliveries_for_rider' as never) as unknown as Promise<{
    data: UnassignedDeliveryRow[] | null;
    error: PostgrestError | null;
  }>;
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

// Ticket: handover-code/02 — rider enters the customer's 6-digit handover code.
// SECURITY DEFINER RPC; returns true when verified, false on a wrong code,
// and raises (PostgrestError) on lockout or non-assigned riders.
export function rpcVerifyHandoverCode(deliveryId: string, code: number): Promise<{
  data: VerifyHandoverCodeResult | null;
  error: PostgrestError | null;
}> {
  return supabase.rpc('verify_delivery_handover_code' as never, {
    _delivery_id: deliveryId,
    _code: code,
  } as never) as unknown as Promise<{
    data: VerifyHandoverCodeResult | null;
    error: PostgrestError | null;
  }>;
}

// Ticket: handover-code/03 — the owning Customer (or ops) reads the code to
// show/relay it. Riders get NULL (their user_id has no customer row), which is
// the point: the code never reaches the rider through any path.
export function rpcGetMyHandoverCode(deliveryId: string): Promise<{
  data: GetMyHandoverCodeResult | null;
  error: PostgrestError | null;
}> {
  return supabase.rpc('get_my_handover_code' as never, {
    _delivery_id: deliveryId,
  } as never) as unknown as Promise<{
    data: GetMyHandoverCodeResult | null;
    error: PostgrestError | null;
  }>;
}
