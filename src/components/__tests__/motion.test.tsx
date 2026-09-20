import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Reveal, MOTION_EASE } from "../motion";

describe("Reveal (shared Motion helper)", () => {
  it("renders children without altering semantics", () => {
    render(
      <Reveal>
        <h1>Track every delivery. Settle every dalasi.</h1>
      </Reveal>
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("uses the house expo-out curve shared with .rise/.press", () => {
    expect([...MOTION_EASE]).toEqual([0.16, 1, 0.3, 1]);
  });

  it("stamps data-reveal on its wrapper (markup contract for tests + CSS)", () => {
    const { container } = render(
      <Reveal>
        <p>revealed</p>
      </Reveal>
    );
    const wrapper = container.querySelector("[data-reveal]");
    expect(wrapper).not.toBeNull();
    expect(wrapper!.textContent).toContain("revealed");
  });
});
