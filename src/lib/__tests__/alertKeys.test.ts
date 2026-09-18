import { describe, it, expect } from "vitest";
import { nextFocusIndex, prevFocusIndex } from "../alertKeys";

describe("nextFocusIndex", () => {
  it("returns -1 when empty", () => {
    expect(nextFocusIndex(-1, 0)).toBe(-1);
    expect(nextFocusIndex(0, 0)).toBe(-1);
  });

  it("starts at 0 when unfocused", () => {
    expect(nextFocusIndex(-1, 3)).toBe(0);
  });

  it("advances and clamps at the end", () => {
    expect(nextFocusIndex(0, 3)).toBe(1);
    expect(nextFocusIndex(1, 3)).toBe(2);
    expect(nextFocusIndex(2, 3)).toBe(2);
  });

  it("recovers to 0 when out of range", () => {
    expect(nextFocusIndex(9, 3)).toBe(0);
  });
});

describe("prevFocusIndex", () => {
  it("returns -1 when empty", () => {
    expect(prevFocusIndex(-1, 0)).toBe(-1);
    expect(prevFocusIndex(0, 0)).toBe(-1);
  });

  it("starts at the last card when unfocused", () => {
    expect(prevFocusIndex(-1, 3)).toBe(2);
  });

  it("retreats and clamps at the start", () => {
    expect(prevFocusIndex(2, 3)).toBe(1);
    expect(prevFocusIndex(1, 3)).toBe(0);
    expect(prevFocusIndex(0, 3)).toBe(0);
  });

  it("recovers to the last card when out of range", () => {
    expect(prevFocusIndex(9, 3)).toBe(2);
  });
});
