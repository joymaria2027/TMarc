import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CheckoutStatusPage from "../CheckoutStatusPage";

vi.mock("@/lib/haptics", () => ({
  haptics: { success: vi.fn(), impact: vi.fn(), selectionChanged: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, hasRole: () => false }),
}));

vi.mock("@/lib/cart", () => ({
  useCart: () => ({ items: [], groups: {}, subtotal: 0 }),
}));

vi.mock("@/hooks/usePrefersDark", () => ({
  usePrefersDark: () => false,
}));

vi.mock("@/components/UserNotificationBell", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const paidOrder = {
  id: "order-1",
  order_reference: "DG-0001",
  payment_status: "paid",
  subtotal: 200,
  delivery_fee: 50,
  total: 250,
  payment_reference: "REF-1",
  customer_id: null,
  created_at: new Date().toISOString(),
  merchants: { name: "Test Store" },
};

const pendingOrder = { ...paidOrder, payment_status: "pending" };

const { fromSpy } = vi.hoisted(() => ({ fromSpy: vi.fn() }));

function mockOrder(order: typeof paidOrder) {
  fromSpy.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      neq: () => q,
      gte: () => q,
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: order, error: null }),
    });
    return q;
  });
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromSpy(...args),
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

function renderStatus() {
  return render(
    <MemoryRouter initialEntries={["/checkout/status/order-1"]}>
      <Routes>
        <Route path="/checkout/status/:orderId" element={<CheckoutStatusPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  fromSpy.mockReset();
});

describe("checkout paid reveal (gift-ceremony/01)", () => {
  it("paid order renders Payment confirmed via GiftReveal status block", async () => {
    mockOrder(paidOrder);
    renderStatus();
    await waitFor(() => {
      expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
    });
    expect(
      screen.getAllByRole("status").some((el) => el.textContent?.includes("Payment confirmed"))
    ).toBe(true);
    expect(
      screen.getByText("The merchant has been notified and will start preparing your order.")
    ).toBeInTheDocument();
  });

  it("totals still render with tabular-nums", async () => {
    mockOrder(paidOrder);
    renderStatus();
    await waitFor(() => {
      expect(screen.getByText("Payment confirmed")).toBeInTheDocument();
    });
    expect(screen.getByText("Total").closest("div")?.parentElement?.textContent).toMatch(/250/);
    const totals = document.querySelectorAll(".tabular-nums");
    expect(totals.length).toBeGreaterThan(0);
  });

  it("pending branch is untouched", async () => {
    mockOrder(pendingOrder);
    renderStatus();
    await waitFor(() => {
      expect(screen.getByText("Waiting for payment confirmation")).toBeInTheDocument();
    });
    expect(screen.queryByText("Payment confirmed")).toBeNull();
  });
});
