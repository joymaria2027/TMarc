import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyOrdersPage from "../MyOrdersPage";

const { db, chanCbs, authUser } = vi.hoisted(() => ({
  db: { orders: [] as Record<string, unknown>[] },
  chanCbs: [] as Array<(p: unknown) => void>,
  // Stable identity: page effects depend on `user` — a fresh object per
  // render would loop setState → render forever.
  authUser: { id: "u1" },
}));

vi.mock("@/lib/haptics", () => ({
  haptics: { success: vi.fn(), impact: vi.fn(), selectionChanged: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authUser, loading: false, hasRole: () => false }),
}));

vi.mock("@/components/StorefrontLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/LiveDeliveryMap", () => ({ default: () => null }));
vi.mock("@/components/OrderStatusTimeline", () => ({ default: () => null }));
vi.mock("@/components/OrderChat", () => ({ default: () => null }));

vi.mock("@/integrations/supabase/client", () => {
  interface Chain {
    select: (s: string) => Chain;
    eq: () => Chain;
    order: () => Chain;
    in: (col: string, ids: unknown[]) => Chain;
    is: (col: string, v: null) => Chain;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (resolve: (v: unknown) => unknown) => Promise<unknown>;
  }
  interface Chan {
    on: (e: unknown, f: unknown, cb: (p: unknown) => void) => Chan;
    subscribe: () => void;
  }
  function chainable(table: string): Chain {
    const q = {} as Chain;
    q.select = () => q;
    q.eq = () => q;
    q.order = () => q;
    q.in = () => q;
    q.is = () => q;
    q.maybeSingle = () =>
      Promise.resolve({ data: table === "customers" ? { id: "c1" } : null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => {
      if (table === "orders") return Promise.resolve({ data: db.orders, error: null }).then(resolve);
      return Promise.resolve({ data: [], error: null }).then(resolve);
    };
    return q;
  }
  return {
    supabase: {
      from: (t: string) => chainable(t),
      channel: () => {
        const ch: Chan = {
          on: (_e: unknown, _f: unknown, cb: (p: unknown) => void) => {
            chanCbs.push(cb);
            return ch;
          },
          subscribe: () => {},
        };
        return ch;
      },
      removeChannel: vi.fn(),
    },
  };
});

import { haptics } from "@/lib/haptics";

const base = {
  id: "o1",
  order_reference: "DG-1",
  payment_status: "paid",
  fulfillment_type: "delivery",
  delivery_id: null,
  merchants: { name: "Test Store" },
  created_at: new Date().toISOString(),
  order_items: [{ id: "i1", quantity: 2, name_snapshot: "Widget", line_total: 200 }],
  total: 200,
  customer_id: "c1",
};

const delivered = { ...base, status: "delivered" };
const preparing = { ...base, status: "preparing" };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/orders"]}>
      <MyOrdersPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  db.orders = [];
  chanCbs.length = 0;
  (haptics.success as ReturnType<typeof vi.fn>).mockClear();
  (haptics.selectionChanged as ReturnType<typeof vi.fn>).mockClear();
});

describe("MyOrders delivered afterglow (gift-ceremony/03)", () => {
  it("delivered order renders the banner without buzzing on mount (silent)", async () => {
    db.orders = [{ ...delivered }];
    renderPage();

    await screen.findByText("DG-1");
    expect(screen.getByText("Your order from Test Store arrived.")).toBeInTheDocument();
    expect(
      screen.getAllByRole("status").some((el) => el.textContent?.includes("Your order from"))
    ).toBe(true);
    // State display, not event — no mount buzz for old delivered orders.
    expect(haptics.success).not.toHaveBeenCalled();
  });

  it("realtime transition to delivered buzzes once + announces + shows banner", async () => {
    db.orders = [{ ...preparing }];
    renderPage();
    await screen.findByText("DG-1");
    expect(screen.queryByText("Your order from Test Store arrived.")).toBeNull();

    const arrived = { ...preparing, status: "delivered" };
    chanCbs.forEach((cb) => cb({ new: arrived, old: {} }));

    await waitFor(() => {
      expect(haptics.success).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Order DG-1 is now Delivered")).toBeInTheDocument();
    expect(screen.getByText("Your order from Test Store arrived.")).toBeInTheDocument();
  });

  it("preparing order shows no banner", async () => {
    db.orders = [{ ...preparing }];
    renderPage();

    await screen.findByText("DG-1");
    expect(screen.queryByText("Delivered")).toBeNull();
    expect(screen.queryByText(/arrived\./)).toBeNull();
  });
});
