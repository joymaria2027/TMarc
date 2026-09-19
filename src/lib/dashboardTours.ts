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
