import { describe, it, expect } from "vitest";
import {
  alertGroup,
  alertSeverity,
  filterAlerts,
  humanizeAlertType,
  patchAlerts,
} from "../alertFilters";

const alerts = [
  { id: "1", alert_type: "late_delivery", message: "Order DG-1 is 25 min late", is_resolved: false },
  { id: "2", alert_type: "withdrawal_request", message: "Ama requested D500 payout", is_resolved: false },
  { id: "3", alert_type: "wallet_credit_corrected", message: "Credit fixed for rider 7", is_resolved: true },
  { id: "4", alert_type: "suspicious", message: "Duplicate GPS pings", is_resolved: false },
] as const;

type Row = (typeof alerts)[number];

describe("alertGroup / alertSeverity / humanizeAlertType", () => {
  it("classifies the 11 known types", () => {
    expect(alertGroup("late_delivery")).toBe("delivery");
    expect(alertGroup("withdrawal_request")).toBe("money");
    expect(alertGroup("suspicious")).toBe("system");
    expect(alertGroup("mystery_type")).toBeNull();
  });

  it("marks action-needed types critical", () => {
    expect(alertSeverity("route_deviation")).toBe("critical");
    expect(alertSeverity("withdrawal_request")).toBe("critical");
    expect(alertSeverity("delivery_completed")).toBe("success");
    expect(alertSeverity("duplicate")).toBe("info");
    expect(alertSeverity("mystery_type")).toBe("info");
  });

  it("humanizes jargon and falls back gracefully", () => {
    expect(humanizeAlertType("wallet_credit_corrected")).toBe("Wallet credit corrected");
    expect(humanizeAlertType("withdrawal_request")).toBe("Withdrawal requested");
    expect(humanizeAlertType("mystery_type")).toBe("Mystery type");
  });
});

describe("filterAlerts (triage groups + search)", () => {
  const rows = [...alerts] as unknown as Row[];

  it("returns all on all-group with empty query", () => {
    expect(filterAlerts(rows, { group: "all", query: "" })).toHaveLength(4);
  });

  it("isolates groups without hiding unknown types", () => {
    expect(filterAlerts(rows, { group: "money", query: "" }).map((a) => a.id)).toEqual(["2", "3"]);
    expect(filterAlerts(rows, { group: "system", query: "" }).map((a) => a.id)).toEqual(["4"]);
    const withUnknown = [...rows, { id: "9", alert_type: "mystery_type", message: "?", is_resolved: false }] as Row[];
    expect(filterAlerts(withUnknown, { group: "money", query: "" }).map((a) => a.id)).toEqual(["2", "3", "9"]);
  });

  it("searches message and humanized label case-insensitively", () => {
    expect(filterAlerts(rows, { group: "all", query: "DG-1" }).map((a) => a.id)).toEqual(["1"]);
    expect(filterAlerts(rows, { group: "all", query: "withdrawal requested" }).map((a) => a.id)).toEqual(["2"]);
    expect(filterAlerts(rows, { group: "delivery", query: "late" }).map((a) => a.id)).toEqual(["1"]);
  });
});

describe("patchAlerts (realtime without list jumps)", () => {
  const rows = [...alerts] as unknown as Row[];

  it("prepends matching INSERTs, ignores filtered-out ones", () => {
    const ins = { id: "5", alert_type: "duplicate", message: "x", is_resolved: false } as Row;
    expect(patchAlerts(rows, { kind: "INSERT", row: ins }, "unresolved")[0].id).toBe("5");
    expect(patchAlerts(rows, { kind: "INSERT", row: ins }, "resolved")).toHaveLength(4);
  });

  it("merges UPDATEs and evicts rows leaving the status filter", () => {
    const resolved = { ...rows[0], is_resolved: true };
    const next = patchAlerts(rows, { kind: "UPDATE", row: resolved }, "unresolved");
    expect(next.map((a) => a.id)).not.toContain("1");
    const kept = patchAlerts(rows, { kind: "UPDATE", row: resolved }, "all");
    expect(kept.find((a) => a.id === "1")?.is_resolved).toBe(true);
  });

  it("removes DELETEs", () => {
    expect(patchAlerts(rows, { kind: "DELETE", id: "2" }, "all").map((a) => a.id)).toEqual(["1", "3", "4"]);
  });
});
