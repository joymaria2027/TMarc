import { describe, it, expect } from "vitest";
import { sortDeliveries } from "../deliveries";
import type { DeliverySortState } from "../deliveries";

interface SortRow {
  id: string;
  status: string;
  updated_at: string | null;
  estimated_tariff: number | null;
}

function row(overrides: Partial<SortRow> & { id: string }): SortRow {
  return {
    status: "dispatched",
    updated_at: "2026-09-18T11:00:00Z",
    estimated_tariff: 50,
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
});
