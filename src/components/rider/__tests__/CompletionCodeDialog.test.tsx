import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CompletionCodeDialog from "../CompletionCodeDialog";

// Ticket: handover-code/02 — the rider must enter the customer's handover code
// to complete a delivery. Dialog contract: 6-slot OTP input, RPC verification,
// wrong-code error surfaced, success only via the verify RPC's true return.

const { rpcVerify } = vi.hoisted(() => ({ rpcVerify: vi.fn() }));

vi.mock("@/lib/rpcTypes", () => ({
  rpcVerifyHandoverCode: (...a: unknown[]) => rpcVerify(...a),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// jsdom lacks ResizeObserver; input-otp's internal measurement needs it
// (same stub as RootRoute.test.tsx).
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
// input-otp's paste-protection badge probes elementFromPoint on a timer.
if (!("elementFromPoint" in document)) {
  (document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;
}

const noop = () => {};

function renderDialog(onVerified = noop) {
  return render(
    <CompletionCodeDialog
      open={true}
      onOpenChange={noop}
      deliveryId="d1"
      orderReference="ORD-9"
      onVerified={onVerified}
    />,
  );
}

beforeEach(() => {
  rpcVerify.mockReset();
});

describe("CompletionCodeDialog", () => {
  it("explains the code comes from the customer, not the rider", () => {
    renderDialog();
    expect(screen.getByText(/ask the customer/i)).toBeInTheDocument();
    expect(screen.getByText(/ORD-9/)).toBeInTheDocument();
  });

  it("does not verify until 6 digits are entered", async () => {
    rpcVerify.mockResolvedValue({ data: true, error: null });
    renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(rpcVerify).not.toHaveBeenCalled());
  });

  it("verifies via RPC and calls onVerified only on success", async () => {
    rpcVerify.mockResolvedValue({ data: true, error: null });
    const onVerified = vi.fn();
    renderDialog(onVerified);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(rpcVerify).toHaveBeenCalledWith("d1", 123456));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it("surfaces a wrong code and does not call onVerified", async () => {
    rpcVerify.mockResolvedValue({ data: false, error: null });
    renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "999999" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() =>
      expect(screen.getByText(/incorrect code/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it("surfaces RPC errors (lockout) and stays open", async () => {
    rpcVerify.mockResolvedValue({
      data: null,
      error: { message: "Too many attempts — wait 10 minutes" },
    });
    renderDialog();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(screen.getByText(/too many attempts/i)).toBeInTheDocument());
  });
});
