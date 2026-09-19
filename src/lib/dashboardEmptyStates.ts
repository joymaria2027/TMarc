/** Slice 01: first-run empty-state copy per dashboard role + panel. */

export const emptyStateRoles = [
  "admin",
  "rider",
  "merchant_manager",
  "accountant",
  "business_owner",
  "app_developer",
] as const;

export type EmptyStateRole = (typeof emptyStateRoles)[number];

export interface EmptyStateCopy {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}

/**
 * One entry per empty panel. Copy uses CONTEXT.md terms only
 * (Merchant, Rider, Order, Delivery, Offer/Accept, Settlement, Withdrawal,
 * Wallet). Panels that are inbound-only (notifications) carry guidance with
 * no CTA; dialog-driven panels (tariffs) point at the card above.
 */
export const dashboardEmptyStates: Record<EmptyStateRole, Record<string, EmptyStateCopy>> = {
  admin: {
    deliveries: {
      title: "No deliveries yet",
      body: "Create an Order to generate a Delivery. It appears here for a Rider to Accept.",
      actionLabel: "Create Delivery",
      actionHref: "/deliveries/new",
    },
    status: {
      title: "No data yet",
      body: "The breakdown appears once Deliveries exist.",
    },
    notifications: {
      title: "No notifications",
      body: "Tariff updates from Merchants appear here.",
    },
  },
  rider: {
    offers: {
      title: "No offers right now",
      body: "Offers appear here for a Rider to Accept. Unassigned Deliveries wait on the Deliveries queue.",
      actionLabel: "View Deliveries",
      actionHref: "/deliveries",
    },
    queue: {
      title: "No deliveries yet",
      body: "Accepted Offers land in your queue here.",
    },
  },
  merchant_manager: {
    deliveries: {
      title: "No deliveries yet",
      body: "Create a Delivery and it appears here for tracking.",
      actionLabel: "Create Delivery",
      actionHref: "/deliveries/new",
    },
    tariffs: {
      title: "No tariffs set yet",
      body: "Set a tariff from a Merchant card above. The Rider sees it before Accepting.",
    },
  },
  accountant: {
    settlements: {
      title: "No settled Deliveries yet",
      body: "Settlement runs after a Delivery completes. Pending items queue here.",
      actionLabel: "View Settlements",
      actionHref: "/settlements",
    },
    withdrawals: {
      title: "No withdrawal requests",
      body: "Withdrawal requests from Wallets queue here for approval.",
      actionLabel: "View Wallets",
      actionHref: "/wallet",
    },
  },
  business_owner: {
    revenue: {
      title: "No revenue yet",
      body: "Revenue appears once Deliveries complete and settle across Merchants.",
      actionLabel: "View Merchants",
      actionHref: "/merchants",
    },
  },
  app_developer: {
    activity: {
      title: "No platform activity yet",
      body: "Delivery volume appears once Merchants create Orders. Start with RLS verification.",
      actionLabel: "Run RLS verification",
      actionHref: "/rls-verification",
    },
    webhooks: {
      title: "No webhook events yet",
      body: "Events from Deliveries and Settlements stream here once activity starts.",
      actionLabel: "View webhook events",
      actionHref: "/admin/webhook-events",
    },
  },
};
