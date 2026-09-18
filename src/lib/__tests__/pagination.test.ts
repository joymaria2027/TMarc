import { describe, it, expect } from "vitest";
import { paginate, pageCount, clampPage } from "../pagination";

describe("catalog pagination (ShopPage)", () => {
  const list = Array.from({ length: 25 }, (_, i) => i + 1);

  it("computes page count with ceiling", () => {
    expect(pageCount(25, 12)).toBe(3);
    expect(pageCount(0, 12)).toBe(1);
    expect(pageCount(12, 12)).toBe(1);
  });

  it("slices the requested page", () => {
    expect(paginate(list, 1, 12)).toHaveLength(12);
    expect(paginate(list, 1, 12)[0]).toBe(1);
    expect(paginate(list, 3, 12)).toEqual([25]);
  });

  it("clamps out-of-range pages", () => {
    expect(clampPage(9, 25, 12)).toBe(3);
    expect(clampPage(0, 25, 12)).toBe(1);
  });
});
