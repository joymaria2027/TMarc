import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "../useDebouncedValue";

describe("useDebouncedValue (address fee fan-out)", () => {
  it("debounces rapid address keystrokes to a single update", () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 400), {
        initialProps: { v: "12 Kai" },
      });
      expect(result.current).toBe("12 Kai");
      rerender({ v: "12 Kairaba" });
      rerender({ v: "12 Kairaba Ave" });
      // Still stale before the delay elapses
      expect(result.current).toBe("12 Kai");
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(result.current).toBe("12 Kairaba Ave");
    } finally {
      vi.useRealTimers();
    }
  });
});
