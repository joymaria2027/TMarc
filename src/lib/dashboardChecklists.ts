/** Slice 03: Getting Started checklist definitions + per-role state. */

export const checklistRoles = [
  "admin",
  "rider",
  "merchant_manager",
  "accountant",
  "business_owner",
  "app_developer",
] as const;

export type ChecklistRole = (typeof checklistRoles)[number];

export interface ChecklistItem {
  id: string;
  /** Task-named ("Create first Delivery"), never a feature noun. */
  label: string;
  detail?: string;
  actionLabel?: string;
  /** Real route when the task lives elsewhere; omitted for same-page tasks. */
  actionHref?: string;
  /** True only when the REAL event is observed in data — never on click. */
  done: boolean;
}

/** Per-role completion key — 'dismissed' and 'done' both mean "never auto-reshow". */
export const checklistKey = (role: string) => `dg.checklist.${role}.v1`;

export type ChecklistState = "dismissed" | "done" | null;

export function readChecklistState(role: string): ChecklistState {
  try {
    const v = window.localStorage.getItem(checklistKey(role));
    return v === "dismissed" || v === "done" ? v : null;
  } catch {
    return null;
  }
}

/** Whether the full card may open (replay button otherwise). */
export function isChecklistOpen(role: string, allDone: boolean): boolean {
  const state = readChecklistState(role);
  return state !== "dismissed" && !(state === "done" && allDone);
}

/**
 * Builders turn live dashboard data into checklist items. Every `done`
 * reads a persisted fact (counts, flags); nothing completes on page views
 * or click-through. Copy uses CONTEXT.md terms only.
 */
export function buildAdminChecklist(data: { total: number; active: number; delivered: number; settled: boolean }): ChecklistItem[] {
  return [
    {
      id: "create",
      label: "Create first Delivery",
      detail: "A Delivery appears below for a Rider to Accept.",
      actionLabel: "Create Delivery",
      actionHref: "/deliveries/new",
      done: data.total > 0,
    },
    {
      id: "assign",
      label: "Assign a Rider",
      detail: "Assigned Deliveries leave the unassigned pool.",
      actionLabel: "Open queue",
      actionHref: "/deliveries",
      done: data.active > 0 || data.delivered > 0,
    },
    {
      id: "settle",
      label: "Review first Settlement",
      detail: "Approval releases Rider earnings to Wallets.",
      actionLabel: "View Settlements",
      actionHref: "/settlements",
      done: data.settled,
    },
  ];
}

export function buildRiderChecklist(data: { isOnline: boolean; queueCount: number; deliveredCount: number }): ChecklistItem[] {
  return [
    {
      id: "online",
      label: "Go Online",
      detail: "Online Riders receive Offers.",
      actionLabel: "Go online now",
      done: data.isOnline,
    },
    {
      id: "accept",
      label: "Accept first Offer",
      detail: "Accepted Offers land in your queue.",
      actionLabel: "Find Offers",
      actionHref: "/deliveries",
      done: data.queueCount > 0,
    },
    {
      id: "complete",
      label: "Complete a Delivery",
      detail: "Completion triggers Settlement to your Wallet.",
      done: data.deliveredCount > 0,
    },
  ];
}

export function buildManagerChecklist(data: { merchantCount: number; tariffCount: number; deliveryCount: number }): ChecklistItem[] {
  return [
    {
      id: "merchant",
      label: "Confirm your Merchant",
      detail: "Ask an admin for assignment when the list is empty.",
      actionLabel: "View Merchants",
      actionHref: "/merchants",
      done: data.merchantCount > 0,
    },
    {
      id: "create",
      label: "Create first Delivery",
      detail: "The Delivery appears below for live tracking.",
      actionLabel: "Create Delivery",
      actionHref: "/deliveries/new",
      done: data.deliveryCount > 0,
    },
    {
      id: "tariff",
      label: "Set first tariff",
      detail: "The Rider sees the tariff before Accepting.",
      actionLabel: "Set tariff",
      done: data.tariffCount > 0,
    },
  ];
}

export function buildAccountantChecklist(data: {
  settledCount: number;
  withdrawalsTotal: number;
  withdrawalsPending: number;
  deliveredTotal: number;
  pendingSettlements: number;
}): ChecklistItem[] {
  return [
    {
      id: "approve",
      label: "Approve first Settlement",
      detail: "Approval releases Rider and Merchant earnings.",
      actionLabel: "View Settlements",
      actionHref: "/settlements",
      done: data.settledCount > 0,
    },
    {
      id: "withdrawals",
      label: "Clear the Withdrawal queue",
      detail: "Resolve every pending request from Wallets.",
      actionLabel: "View Wallets",
      actionHref: "/wallet",
      done: data.withdrawalsTotal > 0 && data.withdrawalsPending === 0,
    },
    {
      id: "settle-all",
      label: "Settle every delivered Delivery",
      detail: "All delivered Deliveries end settled.",
      actionLabel: "View Settlements",
      actionHref: "/settlements",
      done: data.deliveredTotal > 0 && data.pendingSettlements === 0,
    },
  ];
}

export function buildOwnerChecklist(data: { merchantCount: number; deliveredCount: number; settled: boolean }): ChecklistItem[] {
  return [
    {
      id: "merchant",
      label: "Add first Merchant",
      detail: "Merchants generate every Delivery below.",
      actionLabel: "View Merchants",
      actionHref: "/merchants",
      done: data.merchantCount > 0,
    },
    {
      id: "complete",
      label: "Complete first Delivery",
      detail: "Completed Deliveries feed the trend.",
      actionLabel: "View Deliveries",
      actionHref: "/deliveries",
      done: data.deliveredCount > 0,
    },
    {
      id: "settle",
      label: "Settle first earnings",
      detail: "Settlement moves revenue to Wallets.",
      actionLabel: "View Settlements",
      actionHref: "/settlements",
      done: data.settled,
    },
  ];
}

export function buildDeveloperChecklist(data: {
  merchantCount: number;
  riderCount: number;
  deliveryCount: number;
  alertCount: number;
}): ChecklistItem[] {
  const hasActivity = data.deliveryCount > 0 || data.merchantCount > 0 || data.riderCount > 0;
  return [
    {
      id: "merchant",
      label: "Welcome first Merchant",
      detail: "Merchants create the Orders behind every Delivery.",
      actionLabel: "View Merchants",
      actionHref: "/merchants",
      done: data.merchantCount > 0,
    },
    {
      id: "rider",
      label: "Welcome first Rider",
      detail: "Riders Accept Offers and complete Deliveries.",
      actionLabel: "View Riders",
      actionHref: "/riders",
      done: data.riderCount > 0,
    },
    {
      id: "alerts",
      label: "Clear the alert queue",
      detail: "No open alerts while the platform has activity.",
      actionLabel: "View alerts",
      actionHref: "/alerts",
      done: data.alertCount === 0 && hasActivity,
    },
  ];
}
