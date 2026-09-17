// Pure helpers for RiderDashboard — kept separate so they can be unit-tested
// without rendering the whole component (which depends on Supabase, GPS, etc).

export interface QueueState<T extends { id: string }> {
  deliveries: T[];
  unassigned: T[];
  offered: T[];
  activeDelivery: T | null;
  detail: T | null;
}

/**
 * Returns a new QueueState with the given delivery id removed from every
 * client-side list. Used by both the "reject offer" and "decline own
 * delivery" flows to clear the row from the initiating rider's queue
 * the moment the server confirms the rejection.
 */
export function removeDeliveryFromQueue<T extends { id: string }>(
  state: QueueState<T>,
  deliveryId: string,
): QueueState<T> {
  return {
    deliveries: state.deliveries.filter(d => d.id !== deliveryId),
    unassigned: state.unassigned.filter(d => d.id !== deliveryId),
    offered: state.offered.filter(d => d.id !== deliveryId),
    activeDelivery: state.activeDelivery?.id === deliveryId ? null : state.activeDelivery,
    detail: state.detail?.id === deliveryId ? null : state.detail,
  };
}
