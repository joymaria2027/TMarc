import { describe, it, expect } from "vitest";
import { partitionPayoutDeliveries, validateRunPeriod, confidenceBand, requiresReviewReason } from "../moneyGuards";

describe("validateRunPeriod (payroll run guard)", () => {
  it("requires both dates", () => {
    expect(validateRunPeriod("", "2026-09-18")).toMatch(/start and end/i);
    expect(validateRunPeriod("2026-08-18", "")).toMatch(/start and end/i);
  });

  it("rejects reversed range", () => {
    expect(validateRunPeriod("2026-09-18", "2026-08-18")).toMatch(/before/i);
  });

  it("accepts valid range", () => {
    expect(validateRunPeriod("2026-08-18", "2026-09-18")).toBeNull();
    expect(validateRunPeriod("2026-09-18", "2026-09-18")).toBeNull();
  });
});

describe("partitionPayoutDeliveries (honest payout toast)", () => {
  const d = (id: string, approved: boolean, sharing: object | null) => ({
    id,
    settlement_approved: approved,
    sharing,
  });

  it("approves only unapproved deliveries with a sharing ratio", () => {
    const { approvable, skippedNoRatio } = partitionPayoutDeliveries([
      d("a", false, { rider_percentage: 50 }),
      d("b", false, null),
      d("c", true, { rider_percentage: 50 }),
      d("e", true, null),
    ]);
    expect(approvable.map((x) => x.id)).toEqual(["a"]);
    expect(skippedNoRatio.map((x) => x.id)).toEqual(["b"]);
  });

  it("is empty-safe", () => {
    expect(partitionPayoutDeliveries([])).toEqual({ approvable: [], skippedNoRatio: [] });
  });
});

describe("confidenceBand (expense auto-verify grades)", () => {
  it("grades A at 85+, B at 60-84, C below 60", () => {
    expect(confidenceBand(100)).toBe("A");
    expect(confidenceBand(85)).toBe("A");
    expect(confidenceBand(84)).toBe("B");
    expect(confidenceBand(60)).toBe("B");
    expect(confidenceBand(59)).toBe("C");
    expect(confidenceBand(0)).toBe("C");
  });

  it("treats unscored legacy rows as B (today's behavior)", () => {
    expect(confidenceBand(null)).toBe("B");
    expect(confidenceBand(undefined)).toBe("B");
  });

  it("requires a reason only for C-band", () => {
    expect(requiresReviewReason(59)).toBe(true);
    expect(requiresReviewReason(60)).toBe(false);
    expect(requiresReviewReason(95)).toBe(false);
    expect(requiresReviewReason(null)).toBe(false);
  });
});
