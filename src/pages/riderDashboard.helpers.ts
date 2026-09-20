// Pure helpers for RiderDashboard — kept separate so they can be unit-tested
// without rendering the whole component (which depends on Supabase, GPS, etc).

import { formatMoney } from '@/lib/finance';

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

/**
 * Selects the run shown in the Active Delivery card (map, GPS, End Delivery).
 * Only a *started* run counts: `accepted` must stay in My queue behind the
 * Start Delivery button, which is what opens the start-odometer dialog.
 * Promoting `accepted` to Active skips the mileage stage entirely.
 */
export function findActiveDelivery<T extends { status: string }>(
  deliveries: T[],
): T | null {
  return deliveries.find(d => ['picked_up', 'in_transit'].includes(d.status)) ?? null;
}

/**
 * Anti-abuse gate for the Mark Completed shortcut. It pays out via settlement,
 * so it must never fire on a run with zero proof: the delivery must be
 * accepted AND carry an attached receipt. (Started runs complete through the
 * End Delivery + end-odometer flow instead. The database trigger enforces the
 * same rule server-side so direct API calls cannot bypass it.)
 */
export function canMarkCompleted(d: {
  status: string;
  receipt_attached?: boolean | null;
}): boolean {
  return d.status === 'accepted' && d.receipt_attached === true;
}

export interface RunSummaryInput {
  order_reference: string | null;
  start_odometer_miles?: number | null;
  end_odometer_miles?: number | null;
  estimated_tariff?: number | null;
}

export interface RunSummary {
  title: string;
  detail: string;
  reference: string;
}

/**
 * Afterglow copy for a just-completed run (gift-ceremony/02). Pure: miles from
 * the odometer pair when sane (never negative), payout from the tariff, with a
 * "pending settlement" fallback. Never throws on nulls.
 */
export function describeRunSummary(d: RunSummaryInput): RunSummary {
  const start = d.start_odometer_miles;
  const end = d.end_odometer_miles;
  const miles =
    start != null && end != null &&
    Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? Math.round((end - start) * 10) / 10
      : null;
  const tariff =
    d.estimated_tariff != null && Number.isFinite(Number(d.estimated_tariff))
      ? Number(d.estimated_tariff)
      : null;
  const parts: string[] = [];
  if (miles != null) parts.push(`${miles.toFixed(1)} mi covered`);
  parts.push(tariff != null ? `${formatMoney(tariff)} payout` : 'payout pending settlement');
  return {
    title: 'Delivery completed',
    detail: parts.join(' · '),
    reference: d.order_reference ?? '',
  };
}
