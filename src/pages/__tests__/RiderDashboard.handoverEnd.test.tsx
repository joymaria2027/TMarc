import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RiderDashboard from "../RiderDashboard";

// Ticket: handover-code/02 — End Delivery must not write `delivered` until the
// customer's handover code is verified. Flow: End Delivery → odometer capture
// → handover-code dialog → verify → THEN the delivered update. Cancelling the
// code dialog leaves the run in_transit with no write.

const { db, rpc, authUser, writes } = vi.hoisted(() => ({
  db: {
    riderId: "r1",
    deliveries: [] as Record<string, unknown>[],
    offeredFull: [] as Record<string, unknown>[],
    rejections: [] as Record<string, unknown>[],
    merchants: [] as Record<string, unknown>[],
  },
  rpc: {
    claim: vi.fn(),
    unassigned: vi.fn(),
    offered: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
  },
  authUser: { id: "u1" },
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/lib/haptics", () => ({
  haptics: { success: vi.fn(), impact: vi.fn(), selectionChanged: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authUser, loading: false, hasRole: () => false }),
}));

vi.mock("@/hooks/useGpsTracking", () => ({
  useGpsTracking: () => ({
    tracking: true,
    currentPosition: null,
    startTracking: vi.fn(),
    stopTracking: vi.fn(),
    calculateDistance: () => 5.2,
    positions: [],
  }),
}));

vi.mock("@/components/DeliveryMap", () => ({ default: () => null }));
vi.mock("@/components/OrderStatusTimeline", () => ({ default: () => null }));
vi.mock("@/components/ReceiptUpload", () => ({ default: () => null }));
vi.mock("@/components/PaymentMethodSelect", () => ({ default: () => null }));
vi.mock("@/components/WalletWidget", () => ({ default: () => null }));
vi.mock("@/components/RiderDispatchOffers", () => ({ default: () => null }));
vi.mock("@/components/FirstRunHint", () => ({ default: () => null }));
vi.mock("@/components/OdometerCaptureDialog", () => ({
  default: ({
    open,
    onConfirmed,
    title,
  }: {
    open: boolean;
    onConfirmed: (miles: number, photoUrl: string) => void;
    title: string;
  }) =>
    open ? (
      <button onClick={() => onConfirmed(103.2, "http://photo/x.jpg")}>{title}</button>
    ) : null,
}));

// The real dialog verifies via RPC before calling onVerified; the mock stands
// in for that contract — onVerified fires only after a server-verified code.
vi.mock("@/components/rider/CompletionCodeDialog", () => ({
  default: ({
    open,
    onVerified,
    onOpenChange,
  }: {
    open: boolean;
    onVerified: () => void;
    onOpenChange: (o: boolean) => void;
  }) =>
    open ? (
      <div>
        <button onClick={onVerified}>verify-handover-code</button>
        <button onClick={() => onOpenChange(false)}>cancel-handover-code</button>
      </div>
    ) : null,
}));

vi.mock("@/lib/rpcTypes", () => ({
  rpcCancelDeliveryAcceptance: (...a: unknown[]) => rpc.cancel(...a),
  rpcClaimDelivery: (...a: unknown[]) => rpc.claim(...a),
  rpcGetUnassignedDeliveriesForRider: (...a: unknown[]) => rpc.unassigned(...a),
  rpcGetOfferedDeliveries: (...a: unknown[]) => rpc.offered(...a),
  rpcRejectDelivery: (...a: unknown[]) => rpc.reject(...a),
}));

vi.mock("@/integrations/supabase/client", () => {
  interface Chain {
    select: (s: string) => Chain;
    eq: () => Chain;
    neq: () => Chain;
    gte: () => Chain;
    order: () => Chain;
    limit: () => Chain;
    is: () => Chain;
    in: () => Chain;
    update: (p: Record<string, unknown>) => Chain;
    insert: () => Chain;
    single: () => Promise<{ data: unknown; error: null }>;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (resolve: (v: unknown) => unknown) => Promise<unknown>;
  }
  function chainable(table: string): Chain {
    let sel = "";
    let payload: Record<string, unknown> | null = null;
    const q = {} as Chain;
    q.select = (s: string) => { sel = s; return q; };
    q.eq = () => q;
    q.neq = () => q;
    q.gte = () => q;
    q.order = () => q;
    q.limit = () => q;
    q.is = () => q;
    q.in = () => q;
    q.update = (p: Record<string, unknown>) => { payload = p; return q; };
    q.insert = () => q;
    q.single = () =>
      Promise.resolve({ data: table === "riders" ? { id: db.riderId } : null, error: null });
    q.maybeSingle = () =>
      Promise.resolve({ data: table === "riders" ? { id: db.riderId } : null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => {
      if (payload) {
        writes.push({ table, payload });
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
      if (table === "deliveries") {
        const data = sel.includes("merchants(name)") ? db.offeredFull : db.deliveries;
        return Promise.resolve({ data, error: null }).then(resolve);
      }
      if (table === "delivery_rejections")
        return Promise.resolve({ data: db.rejections, error: null }).then(resolve);
      if (table === "merchants")
        return Promise.resolve({ data: db.merchants, error: null }).then(resolve);
      return Promise.resolve({ data: [], error: null }).then(resolve);
    };
    return q;
  }
  return {
    supabase: {
      from: (t: string) => chainable(t),
      channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
      removeChannel: vi.fn(),
    },
  };
});

import { toast } from "sonner";

const activeDelivery = {
  id: "d1",
  rider_id: "r1",
  status: "in_transit",
  merchant_id: "m1",
  pickup_address: "A",
  dropoff_address: "B",
  pickup_latitude: null,
  pickup_longitude: null,
  dropoff_latitude: null,
  dropoff_longitude: null,
  dispatched_at: null,
  picked_up_at: new Date().toISOString(),
  delivered_at: null,
  actual_distance_km: null,
  start_odometer_miles: 100,
  end_odometer_miles: null,
  estimated_distance_km: 3,
  order_reference: "DG-9",
  estimated_tariff: 1250,
  receipt_attached: false,
  created_at: new Date().toISOString(),
  merchants: { name: "Test Store" },
};

beforeEach(() => {
  db.deliveries = [];
  db.offeredFull = [];
  db.rejections = [];
  db.merchants = [];
  writes.length = 0;
  (toast.success as ReturnType<typeof vi.fn>).mockClear();
  (toast.error as ReturnType<typeof vi.fn>).mockClear();
  Object.values(rpc).forEach((fn) => fn.mockReset());
  rpc.unassigned.mockResolvedValue({ data: [], error: null });
  rpc.offered.mockResolvedValue({ data: [], error: null });
});

describe("RiderDashboard End Delivery handover-code gate (handover-code/02)", () => {
  it("writes delivered only after the handover code is verified", async () => {
    db.deliveries = [{ ...activeDelivery }];
    render(<MemoryRouter><RiderDashboard /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: /end delivery/i }));
    fireEvent.click(await screen.findByRole("button", { name: /end odometer reading/i }));

    // Odometer captured but NOT verified yet — no delivered write may exist.
    expect(screen.getByRole("button", { name: /verify-handover-code/i })).toBeInTheDocument();
    // (Mount emits an unrelated riders.is_online write; only deliveries writes count.)
    expect(writes.filter((w) => w.table === "deliveries")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /verify-handover-code/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Delivery completed/));
    });
    const deliveredWrite = writes.find((w) => w.table === "deliveries");
    expect(deliveredWrite).toBeDefined();
    expect(deliveredWrite!.payload.status).toBe("delivered");
    expect(deliveredWrite!.payload.end_odometer_miles).toBe(103.2);
  });

  it("leaves the run in_transit with no write when the code step is cancelled", async () => {
    db.deliveries = [{ ...activeDelivery }];
    render(<MemoryRouter><RiderDashboard /></MemoryRouter>);

    fireEvent.click(await screen.findByRole("button", { name: /end delivery/i }));
    fireEvent.click(await screen.findByRole("button", { name: /end odometer reading/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel-handover-code/i }));

    expect(writes.filter((w) => w.table === "deliveries")).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/Delivery completed/));
  });
});
