import { describe, it, expect } from "vitest";
import { decidePostOrderNavigation } from "../checkoutPostOrder";

describe("decidePostOrderNavigation (never orphan multi-order)", () => {
  it("redirects single order to ModemPay URL", () => {
    expect(
      decidePostOrderNavigation({ merchantIds: ["m1"], orderIds: ["o1"], redirectUrls: ["https://pay/x"] })
    ).toEqual({ kind: "redirect", url: "https://pay/x" });
  });

  it("falls back to status page when single order has no (or stub) URL", () => {
    expect(decidePostOrderNavigation({ merchantIds: ["m1"], orderIds: ["o1"], redirectUrls: [] })).toEqual({
      kind: "status",
      orderId: "o1",
    });
    expect(
      decidePostOrderNavigation({ merchantIds: ["m1"], orderIds: ["o1"], redirectUrls: [null, "  "] })
    ).toEqual({ kind: "status", orderId: "o1" });
  });

  it("sends multi-order to My orders even when a first redirect exists", () => {
    expect(
      decidePostOrderNavigation({
        merchantIds: ["m1", "m2"],
        orderIds: ["o1", "o2"],
        redirectUrls: ["https://pay/first", "https://pay/second"],
      })
    ).toEqual({ kind: "orders" });
  });

  it("falls back to orders on empty input (safe default)", () => {
    expect(decidePostOrderNavigation({ merchantIds: [], orderIds: [], redirectUrls: [] })).toEqual({
      kind: "orders",
    });
  });
});
