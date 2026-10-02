import { describe, it, expect } from "vitest";
import { paginate, pageRange } from "../pagination";

// Page count and clamping are private to the seam. Assert them through
// `paginate` rather than re-exporting helpers nothing outside calls.

describe("paginate — the single pagination seam", () => {
  const list = Array.from({ length: 25 }, (_, i) => i + 1);

  it("computes totalPages with ceiling", () => {
    expect(paginate(list, 1, 12).totalPages).toBe(3);
    expect(paginate([], 1, 12).totalPages).toBe(1);
    expect(paginate(list.slice(0, 12), 1, 12).totalPages).toBe(1);
  });

  it("reports one page for a non-positive page size instead of dividing by zero", () => {
    expect(paginate([], 1, 0).totalPages).toBe(1);
    expect(paginate([], 1, -5).totalPages).toBe(1);
  });

  it("slices the requested page (1-based)", () => {
    const r = paginate(list, 1, 12);
    expect(r.items).toHaveLength(12);
    expect(r.items[0]).toBe(1);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(12);
    expect(r.totalItems).toBe(25);
    expect(r.totalPages).toBe(3);
  });

  it("slices a partial last page", () => {
    const r = paginate(list, 3, 12);
    expect(r.items).toEqual([25]);
    expect(r.page).toBe(3);
    expect(r.totalPages).toBe(3);
  });

  it("reports a 1-based display range", () => {
    expect(paginate(list, 1, 12)).toMatchObject({ start: 1, end: 12 });
    expect(paginate(list, 2, 12)).toMatchObject({ start: 13, end: 24 });
    expect(paginate(list, 3, 12)).toMatchObject({ start: 25, end: 25 });
  });

  it("clamps a page beyond the end to the last page", () => {
    const r = paginate(list, 99, 12);
    expect(r.page).toBe(3);
    expect(r.items).toEqual([25]);
    expect(r).toMatchObject({ start: 25, end: 25 });
  });

  it("clamps a page below the start to page 1", () => {
    expect(paginate(list, 0, 12).items).toEqual(list.slice(0, 12));
    expect(paginate(list, -7, 12).page).toBe(1);
  });

  it("floors a fractional page instead of slicing a partial page", () => {
    expect(paginate(list, 2.7, 12).page).toBe(2);
    expect(paginate(list, 2.7, 12).items).toEqual(list.slice(12, 24));
  });

  it("treats a non-positive page size as 1 so the slice still terminates", () => {
    const r = paginate(list, 2, 0);
    expect(r.pageSize).toBe(1);
    expect(r.items).toEqual([2]);
    expect(r.totalPages).toBe(25);
  });

  it("handles an empty list without a nonsense display range", () => {
    const r = paginate([], 1, 10);
    expect(r.items).toEqual([]);
    expect(r.totalItems).toBe(0);
    expect(r.totalPages).toBe(1);
    expect(r.start).toBe(0);
    expect(r.end).toBe(0);
  });

  it("does not mutate the input", () => {
    const input = [1, 2, 3];
    paginate(input, 1, 2);
    expect(input).toEqual([1, 2, 3]);
  });

  // The seam owns the base convention, so the server range must agree with the
  // client slice. These are the numbers Supabase `.range(from, to)` expects.
  it("derives a server range that agrees with pageRange and the slice", () => {
    for (const page of [1, 2, 3]) {
      const r = paginate(list, page, 12);
      const expected = pageRange(page, 12);
      expect(r.from).toBe(expected.from);
      expect(r.to).toBe(expected.to);
      expect(r.items).toEqual(list.slice(expected.from, expected.from + 12));
    }
  });

  it("uses the clamped page for the server range, not the requested one", () => {
    const r = paginate(list, 99, 12);
    expect(r.page).toBe(3);
    expect(r.from).toBe(24);
  });
});

describe("pageRange (server pagination math)", () => {
  it("page 1 size 20 → rows 0..19", () => {
    expect(pageRange(1, 20)).toEqual({ from: 0, to: 19 });
  });
  it("page 2 size 20 → rows 20..39", () => {
    expect(pageRange(2, 20)).toEqual({ from: 20, to: 39 });
  });
  it("page 3 size 10 → rows 20..29", () => {
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });
  it("clamps page 0 / negative / fractional to page 1", () => {
    expect(pageRange(0, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(-2, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(1.7, 20)).toEqual({ from: 0, to: 19 });
  });
});