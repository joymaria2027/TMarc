import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { reduceMotion } = vi.hoisted(() => ({ reduceMotion: { value: false } }));

vi.mock("@/lib/haptics", () => ({
  haptics: { success: vi.fn(), impact: vi.fn(), selectionChanged: vi.fn() },
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

import GiftReveal from "./GiftReveal";
import { haptics } from "@/lib/haptics";

beforeEach(() => {
  vi.mocked(haptics.success).mockClear();
  reduceMotion.value = false;
});

describe("GiftReveal (gift-ceremony/01)", () => {
  it("renders title + description with role=status", () => {
    render(<GiftReveal title="Payment confirmed" description="Merchant notified" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Payment confirmed");
    expect(status).toHaveTextContent("Merchant notified");
  });

  it("fires haptics.success exactly once on mount", () => {
    const { rerender } = render(<GiftReveal title="Hi" />);
    rerender(<GiftReveal title="Hi" />);
    expect(haptics.success).toHaveBeenCalledTimes(1);
  });

  it("renders afterglow children", () => {
    render(
      <GiftReveal title="Done">
        <span data-testid="afterglow">keep me</span>
      </GiftReveal>
    );
    expect(screen.getByTestId("afterglow")).toBeInTheDocument();
  });

  it("stays silent when the caller owns the buzz", () => {
    render(<GiftReveal title="Done" silent />);
    expect(haptics.success).not.toHaveBeenCalled();
  });

  it("collapses to static content under reduced motion", () => {
    reduceMotion.value = true;
    render(<GiftReveal title="Static title" description="Static desc" />);
    expect(screen.getByRole("status")).toHaveTextContent("Static title");
    expect(screen.getByRole("status")).toHaveTextContent("Static desc");
  });
});
