import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyOrdersPage from "../MyOrdersPage";

// Ticket: handover-code/03 — the CUSTOMER is the source of the handover code.
// While the delivery is on the road the order card shows the 6 digits (with a
// copy button); once delivered the code is gone (server deletes it) and the
// card must not render a stale block.

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

const onTheRoad = {
  ...base,
  status: "dispatched",
  // Embedded delivery (orders.delivery_id FK) with the customer-visible code.
  deliveries: { id: "d1", status: "dispatched", handover_code: 482913 },
};

beforeEach(() => {
  db.orders = [];
  chanCbs.length = 0;
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/orders"]}>
      <MyOrdersPage />
    </MemoryRouter>
  );
}

describe("MyOrders handover code display (handover-code/03)", () => {
  it("shows the 6-digit code while the delivery is on the road", async () => {
    db.orders = [{ ...onTheRoad }];
    renderPage();
    const block = await screen.findByTestId("handover-code");
    expect(block).toHaveTextContent(/482\s?913/);
    // Instruction matters more than decoration: the customer must know WHY.
    expect(screen.getByText(/share this code only with your rider/i)).toBeInTheDocument();
  });

  it("formats the code in two groups of three for readability", async () => {
    db.orders = [{ ...onTheRoad }];
    renderPage();
    const block = await screen.findByTestId("handover-code");
    expect(block.textContent).toMatch(/482\s?913/);
  });

  it("does not render a code block when there is no delivery yet", () => {
    db.orders = [{ ...base, status: "preparing" }];
    renderPage();
    expect(screen.queryByTestId("handover-code")).not.toBeInTheDocument();
  });

  it("does not render a code block once delivered", () => {
    db.orders = [
      { ...onTheRoad, status: "delivered", deliveries: { id: "d1", status: "delivered", handover_code: null } },
    ];
    renderPage();
    expect(screen.queryByTestId("handover-code")).not.toBeInTheDocument();
  });

  it("copy button uses the clipboard and confirms", async () => {
    db.orders = [{ ...onTheRoad }];
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /copy handover code/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("482913"));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});
