import { describe, it, expect } from "vitest";
import {
  deliveryClaimLabel,
  deliveryDeleteLabel,
  deliveryFlagLabel,
  deliveryShortRef,
  deliveryStatusMeta,
  deliveryUnflagLabel,
  deliveryViewLabel,
  flagPayload,
  formatTariff,
  isUnassignedRow,
  MANUAL_FLAG_REASON,
  matchesDeliverySearch,
  parseHighlightId,
  paymentMethodLabel,
} from "../deliveries";

describe("deliveryStatusMeta (icon+label, never color-only)", () => {
  it("maps every known status to a label, token classes and an icon", () => {
    for (const status of ["pending", "unassigned", "dispatched", "in_transit", "delivered", "cancelled"]) {
      const meta = deliveryStatusMeta(status);
      expect(meta.label).toBeTruthy();
      expect(meta.badgeClassName).toBeTruthy();
      expect(meta.icon).toBeDefined();
    }
  });

  it("uses human-readable labels", () => {
    expect(deliveryStatusMeta("in_transit").label).toBe("In transit");
    expect(deliveryStatusMeta("delivered").label).toBe("Delivered");
  });

  it("falls back gracefully for unknown statuses", () => {
    const meta = deliveryStatusMeta("teleporting");
    expect(meta.label).toBe("Teleporting");
    expect(meta.icon).toBeDefined();
  });
});

describe("formatTariff (right-aligned tabular money)", () => {
  it("formats numbers with two decimals", () => {
    expect(formatTariff(12.5)).toBe("D12.50");
    expect(formatTariff("7")).toBe("D7.00");
  });

  it("hides absent values like the legacy truthy check", () => {
    expect(formatTariff(null)).toBeNull();
    expect(formatTariff(undefined)).toBeNull();
    expect(formatTariff(0)).toBeNull();
    expect(formatTariff(Number.NaN)).toBeNull();
  });
});

describe("flagPayload (flag/unflag toggle)", () => {
  it("flags with the manual reason", () => {
    expect(flagPayload(true)).toEqual({ is_flagged: true, flag_reason: MANUAL_FLAG_REASON });
  });

  it("unflags and clears the reason", () => {
    expect(flagPayload(false)).toEqual({ is_flagged: false, flag_reason: null });
  });
});

describe("matchesDeliverySearch (client-side filter)", () => {
  const row = {
    id: "abc-123-def",
    order_reference: "ORD-42",
    pickup_address: "Kairaba Avenue",
    dropoff_address: "Bakau Market",
  };

  it("matches across reference, addresses and id (case-insensitive)", () => {
    expect(matchesDeliverySearch(row, "ord-42")).toBe(true);
    expect(matchesDeliverySearch(row, "kairaba")).toBe(true);
    expect(matchesDeliverySearch(row, "BAKAU")).toBe(true);
    expect(matchesDeliverySearch(row, "abc-123")).toBe(true);
  });

  it("passes everything on empty query and rejects misses", () => {
    expect(matchesDeliverySearch(row, "")).toBe(true);
    expect(matchesDeliverySearch(row, "nope")).toBe(false);
  });
});

describe("isUnassignedRow (pool partition)", () => {
  it("keeps unassigned/pending rows without a rider", () => {
    expect(isUnassignedRow({ status: "unassigned", rider_id: null })).toBe(true);
    expect(isUnassignedRow({ status: "pending", rider_id: null })).toBe(true);
  });

  it("excludes assigned or active rows", () => {
    expect(isUnassignedRow({ status: "unassigned", rider_id: "r1" })).toBe(false);
    expect(isUnassignedRow({ status: "dispatched", rider_id: null })).toBe(false);
    expect(isUnassignedRow({ status: "delivered", rider_id: "r1" })).toBe(false);
  });
});

describe("delivery row labels (aria-labels)", () => {
  const withRef = { id: "abcdef123456", order_reference: "ORD-1" };
  const withoutRef = { id: "abcdef123456", order_reference: null };

  it("prefers the order reference, falls back to the id prefix", () => {
    expect(deliveryShortRef(withRef)).toBe("ORD-1");
    expect(deliveryShortRef(withoutRef)).toBe("abcdef12");
  });

  it("builds action labels", () => {
    expect(deliveryViewLabel(withRef)).toBe("View delivery ORD-1");
    expect(deliveryFlagLabel(withRef)).toBe("Flag delivery ORD-1");
    expect(deliveryUnflagLabel(withRef)).toBe("Unflag delivery ORD-1");
    expect(deliveryDeleteLabel(withRef)).toBe("Delete delivery ORD-1");
    expect(deliveryClaimLabel(withRef)).toBe("Claim delivery ORD-1");
  });
});

describe("paymentMethodLabel", () => {
  it("maps known methods and expands bank transfers", () => {
    expect(paymentMethodLabel("cash")).toBe("Cash");
    expect(paymentMethodLabel("bank_transfer", "GTBank")).toBe("Bank Transfer (GTBank)");
    expect(paymentMethodLabel("bank_transfer", null)).toBe("Bank Transfer");
  });

  it("passes unknown methods through and dashes missing ones", () => {
    expect(paymentMethodLabel("crypto")).toBe("crypto");
    expect(paymentMethodLabel(null)).toBe("–");
  });
});

describe("parseHighlightId (?highlight= contract)", () => {
  it("returns trimmed ids and null for blank/missing values", () => {
    expect(parseHighlightId("abc-123")).toBe("abc-123");
    expect(parseHighlightId("  abc-123  ")).toBe("abc-123");
    expect(parseHighlightId(null)).toBeNull();
    expect(parseHighlightId("")).toBeNull();
    expect(parseHighlightId("   ")).toBeNull();
  });
});
