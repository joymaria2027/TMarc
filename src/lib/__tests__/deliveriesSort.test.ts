import { describe, it, expect } from "vitest";
import { sortDeliveries } from "../deliveries";
import type { DeliverySortState } from "../deliveries";

interface SortRow {
  id: string;
  status: string;
  updated_at: string | null;
  estimated_tariff: number | null;
  merchant_id: string | null;
  merchant_name: string | null;
  merchants: { name: string } | null;
  rider_id: string | null;
}

function row(overrides: Partial<SortRow> & { id: string }): SortRow {
  return {
    status: "dispatched",
    updated_at: "2026-09-18T11:00:00Z",
    estimated_tariff: 50,
    merchant_id: "m-1",
    merchant_name: null,
    merchants: { name: "Acme Store" },
    rider_id: "r-1",
    ...overrides,
  };
}

const ids = (rows: SortRow[]): string[] => rows.map((r) => r.id);

describe("sortDeliveries (pure column sort)", () => {
  it("returns rows as received when sort is null (default order)", () => {
    const rows = [row({ id: "c" }), row({ id: "a" }), row({ id: "b" })];
    const out = sortDeliveries(rows, null);
    expect(ids(out)).toEqual(["c", "a", "b"]);
    // Pure: a new array, input untouched.
    expect(out).not.toBe(rows);
    expect(ids(rows)).toEqual(["c", "a", "b"]);
  });

  it("treats { key, dir } asc as the first click state", () => {
    const sort: DeliverySortState = { key: "time", dir: "asc" };
    const rows = [
      row({ id: "new", updated_at: "2026-09-18T12:00:00Z" }),
      row({ id: "old", updated_at: "2026-09-18T09:00:00Z" }),
    ];
    expect(ids(sortDeliveries(rows, sort))).toEqual(["old", "new"]);
  });

  it("sorts times ascending/descending and keeps null times null-safe", () => {
    const rows = [
      row({ id: "mid", updated_at: "2026-09-18T11:00:00Z" }),
      row({ id: "none", updated_at: null }),
      row({ id: "old", updated_at: "2026-09-18T09:00:00Z" }),
      row({ id: "new", updated_at: "2026-09-18T12:00:00Z" }),
    ];
    expect(ids(sortDeliveries(rows, { key: "time", dir: "asc" }))).toEqual([
      "old",
      "mid",
      "new",
      "none",
    ]);
    const desc = sortDeliveries(rows, { key: "time", dir: "desc" });
    expect(ids(desc)).toEqual(["none", "new", "mid", "old"]);
    // Deterministic across runs.
    expect(ids(sortDeliveries(rows, { key: "time", dir: "desc" }))).toEqual(ids(desc));
  });

  it("treats invalid timestamps like missing ones (no throw)", () => {
    const rows = [
      row({ id: "bad", updated_at: "not-a-date" }),
      row({ id: "ok", updated_at: "2026-09-18T09:00:00Z" }),
    ];
    expect(() => sortDeliveries(rows, { key: "time", dir: "asc" })).not.toThrow();
    expect(ids(sortDeliveries(rows, { key: "time", dir: "asc" }))).toEqual(["ok", "bad"]);
  });

  it("sorts tariffs numerically (not lexicographically), nulls last-or-first deterministically", () => {
    const rows = [
      row({ id: "hundred", estimated_tariff: 100 }),
      row({ id: "none", estimated_tariff: null }),
      row({ id: "twenty", estimated_tariff: 20 }),
      row({ id: "nine", estimated_tariff: 9 }),
    ];
    expect(ids(sortDeliveries(rows, { key: "tariff", dir: "asc" }))).toEqual([
      "nine",
      "twenty",
      "hundred",
      "none",
    ]);
    expect(ids(sortDeliveries(rows, { key: "tariff", dir: "desc" }))).toEqual([
      "none",
      "hundred",
      "twenty",
      "nine",
    ]);
  });

  it("sorts statuses in lifecycle order, unknown statuses deterministically last-or-first", () => {
    const rows = [
      row({ id: "d1", status: "delivered" }),
      row({ id: "mystery", status: "teleporting" }),
      row({ id: "p1", status: "pending" }),
      row({ id: "t1", status: "in_transit" }),
      row({ id: "u1", status: "unassigned" }),
      row({ id: "c1", status: "cancelled" }),
      row({ id: "s1", status: "dispatched" }),
    ];
    expect(ids(sortDeliveries(rows, { key: "status", dir: "asc" }))).toEqual([
      "p1",
      "u1",
      "s1",
      "t1",
      "d1",
      "c1",
      "mystery",
    ]);
    expect(ids(sortDeliveries(rows, { key: "status", dir: "desc" }))).toEqual([
      "mystery",
      "c1",
      "d1",
      "t1",
      "s1",
      "u1",
      "p1",
    ]);
  });

  it("is stable: equal keys keep input order in both directions", () => {
    const rows = [
      row({ id: "first", status: "dispatched", updated_at: "2026-09-18T11:00:00Z", estimated_tariff: 10 }),
      row({ id: "second", status: "dispatched", updated_at: "2026-09-18T11:00:00Z", estimated_tariff: 10 }),
      row({ id: "third", status: "dispatched", updated_at: "2026-09-18T11:00:00Z", estimated_tariff: 10 }),
    ];
    for (const sort of [
      { key: "time", dir: "asc" },
      { key: "time", dir: "desc" },
      { key: "tariff", dir: "asc" },
      { key: "status", dir: "desc" },
    ] as DeliverySortState[]) {
      expect(ids(sortDeliveries(rows, sort))).toEqual(["first", "second", "third"]);
    }
  });

  it("does not mutate the input array", () => {
    const rows = [
      row({ id: "b", estimated_tariff: 20 }),
      row({ id: "a", estimated_tariff: 5 }),
    ];
    const snapshot = [...rows];
    sortDeliveries(rows, { key: "tariff", dir: "asc" });
    expect(rows).toEqual(snapshot);
  });

  it("sorts merchants alphabetically, empty names last in asc and first in desc", () => {
    const rows = [
      row({ id: "empty", merchant_name: "", merchants: { name: "" } }),
      row({ id: "alpha", merchant_name: "Alpha", merchants: { name: "Alpha" } }),
      row({ id: "beta", merchant_name: "Beta", merchants: { name: "Beta" } }),
      row({ id: "gamma", merchant_name: "Gamma", merchants: { name: "Gamma" } }),
    ];
    expect(ids(sortDeliveries(rows, { key: "merchant", dir: "asc" }))).toEqual([
      "alpha",
      "beta",
      "gamma",
      "empty",
    ]);
    expect(ids(sortDeliveries(rows, { key: "merchant", dir: "desc" }))).toEqual([
      "empty",
      "gamma",
      "beta",
      "alpha",
    ]);
  });

  it("falls back to merchants.name when merchant_name is null", () => {
    const rows = [
      row({ id: "a", merchant_name: null, merchants: { name: "Merchant A" } }),
      row({ id: "b", merchant_name: "Merchant B", merchants: { name: "Should Not Use" } }),
    ];
    expect(ids(sortDeliveries(rows, { key: "merchant", dir: "asc" }))).toEqual([
      "a",
      "b",
    ]);
  });

  it("sorts riders by rider_id, empty last in asc and first in desc", () => {
    const rows = [
      row({ id: "empty-rider", rider_id: "" }),
      row({ id: "a-rider", rider_id: "rider-a" }),
      row({ id: "b-rider", rider_id: "rider-b" }),
      row({ id: "c-rider", rider_id: "rider-c" }),
    ];
    expect(ids(sortDeliveries(rows, { key: "rider", dir: "asc" }))).toEqual([
      "a-rider",
      "b-rider",
      "c-rider",
      "empty-rider",
    ]);
    expect(ids(sortDeliveries(rows, { key: "rider", dir: "desc" }))).toEqual([
      "empty-rider",
      "c-rider",
      "b-rider",
      "a-rider",
    ]);
  });

  it("is stable for merchant and rider sorts", () => {
    const rows = [
      row({ id: "first", merchant_name: "Same", merchants: { name: "Same" }, rider_id: "rider-x" }),
      row({ id: "second", merchant_name: "Same", merchants: { name: "Same" }, rider_id: "rider-x" }),
      row({ id: "third", merchant_name: "Same", merchants: { name: "Same" }, rider_id: "rider-x" }),
    ];
    for (const sort of [
      { key: "merchant", dir: "asc" },
      { key: "merchant", dir: "desc" },
      { key: "rider", dir: "asc" },
      { key: "rider", dir: "desc" },
    ] as DeliverySortState[]) {
      expect(ids(sortDeliveries(rows, sort))).toEqual(["first", "second", "third"]);
    }
  });
});
