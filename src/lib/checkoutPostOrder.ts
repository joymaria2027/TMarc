export type PostOrderDecision =
  | { kind: "redirect"; url: string }
  | { kind: "status"; orderId: string }
  | { kind: "orders" };

function firstRealUrl(urls: (string | null | undefined)[]): string | null {
  for (const u of urls) {
    if (typeof u === "string" && u.trim().length > 0) return u;
  }
  return null;
}

/**
 * Decide where to send the shopper after creating orders.
 *
 * Single-merchant: redirect to ModemPay when we have a URL, else status page.
 * Multi-merchant: ALWAYS go to My orders so orders 2..N are never orphaned
 * behind a first-only redirect. Each order can be paid from its status page.
 */
export function decidePostOrderNavigation(args: {
  merchantIds: string[];
  orderIds: string[];
  redirectUrls: (string | null | undefined)[];
}): PostOrderDecision {
  const { merchantIds, orderIds, redirectUrls } = args;
  if (merchantIds.length === 0 || orderIds.length === 0) return { kind: "orders" };
  if (merchantIds.length === 1 && orderIds.length === 1) {
    const url = firstRealUrl(redirectUrls);
    if (url) return { kind: "redirect", url };
    return { kind: "status", orderId: orderIds[0] };
  }
  return { kind: "orders" };
}
