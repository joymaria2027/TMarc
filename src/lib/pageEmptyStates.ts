import type { EmptyStateCopy } from "./dashboardEmptyStates";

/**
 * Slice 06: empty-state copy for ops/finance/merchant/admin pages.
 * Parallel to dashboardEmptyStates (role keys stop fitting here).
 * Copy uses CONTEXT.md terms; Claim/run allowed where canonical
 * (Claim = unassigned pool, Payroll executes runs).
 */
export const pageEmptyKeys = [
  "rejectedDeliveries",
  "riders",
  "gpsTracker",
  "wallet",
  "riderExpenses",
  "payroll",
  "merchantOrders",
  "webhookEvents",
  "dispatchAudit",
  "paymentBackfill",
] as const;

export type PageEmptyKey = (typeof pageEmptyKeys)[number];

export const pageEmptyStates: Record<PageEmptyKey, Record<string, EmptyStateCopy>> = {
  rejectedDeliveries: {
    list: {
      title: "No unattended Deliveries right now.",
      body: "Rejections and unassigned Deliveries land here for a Rider to Claim.",
      actionLabel: "View queue",
      actionHref: "/deliveries",
    },
  },
  riders: {
    list: {
      title: "No Riders yet.",
      body: "Use Add Rider above. New Riders Accept Offers once activated.",
    },
  },
  gpsTracker: {
    list: {
      title: "No active Riders.",
      body: "Riders appear here once they go Online and share GPS.",
    },
  },
  wallet: {
    list: {
      title: "No Wallets yet.",
      body: "Wallets open automatically once Settlements approve.",
      actionLabel: "View Settlements",
      actionHref: "/settlements",
    },
  },
  riderExpenses: {
    list: {
      title: "No expenses recorded yet.",
      body: "Expenses Riders submit appear here for review.",
    },
  },
  payroll: {
    assignments: {
      title: "No payroll assignments yet.",
      body: "Link people to a payroll run with an assignment.",
    },
    runs: {
      title: "No payroll runs yet.",
      body: "Runs pay assigned people on schedule.",
    },
  },
  merchantOrders: {
    list: {
      title: "No active orders.",
      body: "New paid orders appear here automatically.",
      actionLabel: "View shop",
      actionHref: "/shop",
    },
  },
  webhookEvents: {
    list: {
      title: "No webhook events yet.",
      body: "Events from Deliveries and Settlements stream here once activity starts.",
      actionLabel: "View Deliveries",
      actionHref: "/deliveries",
    },
  },
  dispatchAudit: {
    list: {
      title: "No audit entries yet.",
      body: "Dispatches, Assigns and Accepts record here.",
      actionLabel: "View Deliveries",
      actionHref: "/deliveries",
    },
  },
  paymentBackfill: {
    list: {
      title: "No backfills yet.",
      body: "Run one above to retry paid Orders that missed Settlement.",
    },
  },
};
