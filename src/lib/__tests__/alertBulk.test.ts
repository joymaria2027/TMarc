import { describe, it, expect } from "vitest";
import {
  applyBulkResolve,
  applyBulkUnresolve,
  normalizeResolveNote,
  toggleSelected,
  visibleIds,
} from "../alertBulk";

const rows = [
  { id: "1", is_resolved: false, resolved_by: null },
  { id: "2", is_resolved: false, resolved_by: null },
  { id: "3", is_resolved: true, resolved_by: "u9" },
];

describe("toggleSelected / visibleIds", () => {
  it("toggles idempotently and keeps order stable", () => {
    expect(toggleSelected([], "1")).toEqual(["1"]);
    expect(toggleSelected(["1", "2"], "1")).toEqual(["2"]);
    expect(toggleSelected(["1"], "2")).toEqual(["1", "2"]);
  });

  it("lists visible ids", () => {
    expect(visibleIds(rows)).toEqual(["1", "2", "3"]);
    expect(visibleIds([])).toEqual([]);
  });
});

describe("applyBulkResolve", () => {
  it("flips selected unresolved rows with the actor id", () => {
    const next = applyBulkResolve(rows, ["1", "2"], "u1");
    expect(next.find((a) => a.id === "1")).toMatchObject({ is_resolved: true, resolved_by: "u1" });
    expect(next.find((a) => a.id === "2")).toMatchObject({ is_resolved: true, resolved_by: "u1" });
    expect(next.find((a) => a.id === "3")).toMatchObject({ is_resolved: true, resolved_by: "u9" });
  });

  it("ignores unknown ids and empty selection", () => {
    expect(applyBulkResolve(rows, ["zzz"], "u1")).toEqual(rows);
    expect(applyBulkResolve(rows, [], "u1")).toEqual(rows);
  });
});

describe("applyBulkUnresolve (session undo)", () => {
  it("flips snapshot rows back and clears resolved_by", () => {
    const resolved = applyBulkResolve(rows, ["1", "2"], "u1");
    const undone = applyBulkUnresolve(resolved, resolved.filter((a) => ["1", "2"].includes(a.id)));
    expect(undone.find((a) => a.id === "1")).toMatchObject({ is_resolved: false, resolved_by: null });
    expect(undone.find((a) => a.id === "3")).toMatchObject({ is_resolved: true, resolved_by: "u9" });
  });

  it("re-adds rows evicted from state (e.g. by Active-filter patch)", () => {
    const resolved = applyBulkResolve(rows, ["1"], "u1");
    const snapshot = resolved.filter((a) => a.id === "1");
    const evicted = resolved.filter((a) => a.id !== "1");
    const undone = applyBulkUnresolve(evicted, snapshot);
    expect(undone.map((a) => a.id)).toContain("1");
    expect(undone.find((a) => a.id === "1")).toMatchObject({ is_resolved: false, resolved_by: null });
  });

  it("is empty-safe", () => {
    expect(applyBulkUnresolve(rows, [])).toEqual(rows);
  });
});

describe("normalizeResolveNote", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeResolveNote("  verified with rider  ")).toBe("verified with rider");
  });

  it("maps empty and blank to null", () => {
    expect(normalizeResolveNote("")).toBeNull();
    expect(normalizeResolveNote("   ")).toBeNull();
    expect(normalizeResolveNote(null)).toBeNull();
    expect(normalizeResolveNote(undefined)).toBeNull();
  });

  it("caps length at 500 characters", () => {
    const long = `x${"y".repeat(600)}z`;
    const out = normalizeResolveNote(long);
    expect(out).not.toBeNull();
    expect(out?.length).toBe(500);
    expect(out).toBe(long.trim().slice(0, 500));
  });
});
