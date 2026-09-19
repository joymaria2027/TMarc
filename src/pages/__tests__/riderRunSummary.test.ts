import { describe, it, expect } from "vitest";
import { describeRunSummary } from "../riderDashboard.helpers";

describe("describeRunSummary (gift-ceremony/02)", () => {
  it("combines miles and payout when odometer + tariff are known", () => {
    const s = describeRunSummary({
      order_reference: "DG-9",
      start_odometer_miles: 100,
      end_odometer_miles: 103.2,
      estimated_tariff: 1250,
    });
    expect(s.title).toBe("Delivery completed");
    expect(s.detail).toBe("3.2 mi covered · D1250.00 payout");
    expect(s.reference).toBe("DG-9");
  });

  it("falls back to payout-only when odometer is missing", () => {
    const s = describeRunSummary({
      order_reference: "DG-9",
      start_odometer_miles: null,
      end_odometer_miles: null,
      estimated_tariff: 800,
    });
    expect(s.detail).toBe("D800.00 payout");
  });

  it("marks payout pending when tariff is unknown, keeping miles", () => {
    const s = describeRunSummary({
      order_reference: null,
      start_odometer_miles: 50,
      end_odometer_miles: 55.5,
      estimated_tariff: null,
    });
    expect(s.detail).toBe("5.5 mi covered · payout pending settlement");
    expect(s.reference).toBe("");
  });

  it("never throws on all-null input", () => {
    const s = describeRunSummary({
      order_reference: null,
      start_odometer_miles: null,
      end_odometer_miles: null,
      estimated_tariff: null,
    });
    expect(s.title).toBe("Delivery completed");
    expect(s.detail).toBe("payout pending settlement");
  });

  it("ignores a backwards odometer reading instead of showing negative miles", () => {
    const s = describeRunSummary({
      order_reference: "DG-9",
      start_odometer_miles: 200,
      end_odometer_miles: 199,
      estimated_tariff: 500,
    });
    expect(s.detail).toBe("D500.00 payout");
  });
});
