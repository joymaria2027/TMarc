/** Slice 02: 3-step spotlight tour definitions per dashboard role. */

export const tourRoles = [
  "admin",
  "rider",
  "merchant_manager",
  "accountant",
  "business_owner",
  "app_developer",
] as const;

export type TourRole = (typeof tourRoles)[number];

/** Per-role completion key — finished OR dismissed both mean "never auto-reshow". */
export const tourKey = (role: string) => `dg.tour.${role}.v1`;

/** Window event for on-demand replay (see TourReplay). */
export const REPLAY_EVENT = "dg:tour-replay";

export interface TourStepDef {
  /** Spotlight selector — must match a data-tour anchor in the dashboard. */
  target: string;
  title: string;
  /** One concept per step; kept short for the tooltip. */
  content: string;
}

/**
 * Exactly 3 steps per role, ordered along the first-run path. Copy uses
 * CONTEXT.md terms only (Merchant, Rider, Order, Delivery, Offer/Accept,
 * Settlement, Withdrawal, Wallet).
 */
export const dashboardTours: Record<TourRole, TourStepDef[]> = {
  admin: [
    {
      target: '[data-tour="admin-strip"]',
      title: "Operations strip",
      content: "Everything live right now: active Deliveries, Riders online, open alerts.",
    },
    {
      target: '[data-tour="admin-recent"]',
      title: "Recent Deliveries",
      content: "New Orders land here as Deliveries. Assign one to a Rider to start.",
    },
    {
      target: '[data-tour="admin-notices"]',
      title: "Tariff notices",
      content: "Merchants set tariffs here. The Rider sees the tariff before Accepting.",
    },
  ],
  rider: [
    {
      target: '[data-tour="rider-availability"]',
      title: "Availability",
      content: "Stay Online to receive Offers. Offline hides you from new Offers.",
    },
    {
      target: '[data-tour="rider-offers"]',
      title: "Delivery Offers",
      content: "New Offers land here. One tap on Accept starts the Delivery.",
    },
    {
      target: '[data-tour="rider-queue"]',
      title: "My queue",
      content: "Accepted Offers land in your queue. Complete the Delivery to trigger Settlement.",
    },
  ],
  merchant_manager: [
    {
      target: '[data-tour="manager-merchants"]',
      title: "My Merchants",
      content: "Each Merchant card starts a Delivery or sets a tariff.",
    },
    {
      target: '[data-tour="manager-tariffs"]',
      title: "My Tariffs",
      content: "Tariffs set the Rider payout per drop-off point.",
    },
    {
      target: '[data-tour="manager-recent"]',
      title: "Recent Deliveries",
      content: "Created Deliveries appear here for live tracking.",
    },
  ],
  accountant: [
    {
      target: '[data-tour="acct-strip"]',
      title: "Finance strip",
      content: "Your finance queue: pending settlements, withdrawals, open alerts.",
    },
    {
      target: '[data-tour="acct-settlements"]',
      title: "Settlements",
      content: "Settled vs pending Deliveries per day. Approval releases Rider earnings.",
    },
    {
      target: '[data-tour="acct-wallet"]',
      title: "Wallets",
      content: "Approved earnings land in Wallets before Withdrawal.",
    },
  ],
  business_owner: [
    {
      target: '[data-tour="owner-strip"]',
      title: "Business strip",
      content: "Delivered revenue, active Deliveries and Merchant count at a glance.",
    },
    {
      target: '[data-tour="owner-trend"]',
      title: "Revenue trend",
      content: "Seven-day revenue trend across all Merchants.",
    },
    {
      target: '[data-tour="owner-revenue"]',
      title: "Merchant revenue",
      content: "Per-Merchant revenue appears here once Deliveries settle.",
    },
  ],
  app_developer: [
    {
      target: '[data-tour="dev-health"]',
      title: "Platform health",
      content: "Platform revenue, active Deliveries and completion rate.",
    },
    {
      target: '[data-tour="dev-links"]',
      title: "Platform data",
      content: "Jump to RLS verification, Merchants and webhook events.",
    },
    {
      target: '[data-tour="dev-charts"]',
      title: "Volume trends",
      content: "Volume and revenue trends surface platform issues early.",
    },
  ],
};

/**
 * Slice 04: page-level micro-tours. Same 3-step shape and storage shape
 * (`dg.tour.<id>.v1`) as role tours. Copy note: `Claim` is canonical on ops
 * surfaces (Claim = unassigned pool, Accept = dispatched offer), so page
 * tours use it where dashboard copy avoids it.
 */
export const pageTourIds = ["deliveries-queue", "alerts-triage", "settlements-approval"] as const;

export type PageTourId = (typeof pageTourIds)[number];

export const pageTours: Record<PageTourId, TourStepDef[]> = {
  "deliveries-queue": [
    {
      target: '[data-tour="deliveries-queue"]',
      title: "Delivery queue",
      content: "Every Delivery passes through this queue. Open a row for the map and tariff.",
    },
    {
      target: '[data-tour="deliveries-unassigned"]',
      title: "Unassigned pool",
      content: "Unassigned Deliveries wait here. Claim one to add it to your queue.",
    },
    {
      target: '[data-tour="deliveries-search"]',
      title: "Search and filter",
      content: "Search by Customer, Rider, or status when the queue grows.",
    },
  ],
  "alerts-triage": [
    {
      target: '[data-tour="alerts-list"]',
      title: "Alert queue",
      content: "Open alerts land here. Each row links the Delivery behind it.",
    },
    {
      target: '[data-tour="alerts-resolve"]',
      title: "Bulk resolve",
      content: "Tick alerts, add a note, Resolve. One batch clears the queue.",
    },
    {
      target: '[data-tour="alerts-filters"]',
      title: "Search and filter",
      content: "Filter by group or status when the queue grows.",
    },
  ],
  "settlements-approval": [
    {
      target: '[data-tour="settlements-summary"]',
      title: "Settlement totals",
      content: "Totals for Deliveries, revenue and approvals.",
    },
    {
      target: '[data-tour="settlements-rows"]',
      title: "Approve payouts",
      content: "Approve a row to release Rider and Merchant earnings.",
    },
    {
      target: '[data-tour="settlements-filters"]',
      title: "Filter and export",
      content: "Slice by date, amount, or status. Export CSV for the books.",
    },
  ],
};
