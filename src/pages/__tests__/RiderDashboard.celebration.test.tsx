import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RiderDashboard from "../RiderDashboard";

const { db, rpc, authUser } = vi.hoisted(() => ({
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
  // Stable identity: RiderDashboard's init effect depends on `user` — a fresh
  // object per render would loop setState → render forever.
  authUser: { id: "u1" },
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
    tracking: false,
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
    open ? <button onClick={() => onConfirmed(103.2, "http://photo/x.jpg")}>{title}</button> : null,
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
    update: () => Chain;
    insert: () => Chain;
    single: () => Promise<{ data: unknown; error: null }>;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (resolve: (v: unknown) => unknown) => Promise<unknown>;
  }
  function chainable(table: string): Chain {
    let sel = "";
    let isWrite = false;
    const q = {} as Chain;
    q.select = (s: string) => { sel = s; return q; };
    q.eq = () => q;
    q.neq = () => q;
    q.gte = () => q;
    q.order = () => q;
    q.limit = () => q;
    q.is = () => q;
    q.in = () => q;
    q.update = () => { isWrite = true; return q; };
    q.insert = () => { isWrite = true; return q; };
    q.single = () =>
      Promise.resolve({ data: table === "riders" ? { id: db.riderId } : null, error: null });
    q.maybeSingle = () =>
      Promise.resolve({ data: table === "riders" ? { id: db.riderId } : null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => {
      if (isWrite) return Promise.resolve({ data: null, error: null }).then(resolve);
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

import { haptics } from "@/lib/haptics";
import { toast } from "sonner";

const offer = {
  id: "offer-1",
  rider_id: null,
  status: "unassigned",
  merchant_id: "m1",
  pickup_address: "Pickup St",
  dropoff_address: "Drop Ave",
  pickup_latitude: null,
  pickup_longitude: null,
  dropoff_latitude: null,
  dropoff_longitude: null,
  dispatched_at: null,
  picked_up_at: null,
  delivered_at: null,
  actual_distance_km: null,
  estimated_distance_km: 2.5,
  order_reference: "DG-101",
  estimated_tariff: 800,
  receipt_attached: false,
  created_at: new Date().toISOString(),
  merchants: { name: "Test Store" },
};

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
  receipt_attached: true,
  created_at: new Date().toISOString(),
  merchants: { name: "Test Store" },
};

beforeEach(() => {
  db.deliveries = [];
  db.offeredFull = [];
  db.rejections = [];
  db.merchants = [];
  Object.values(rpc).forEach((fn) => fn.mockReset());
  rpc.unassigned.mockResolvedValue({ data: [], error: null });
  rpc.offered.mockResolvedValue({ data: [], error: null });
  rpc.claim.mockResolvedValue({ data: { id: "offer-1" }, error: null });
  rpc.reject.mockResolvedValue({ data: true, error: null });
  rpc.cancel.mockResolvedValue({ data: true, error: null });
  (haptics.success as ReturnType<typeof vi.fn>).mockClear();
  (toast.success as ReturnType<typeof vi.fn>).mockClear();
  (toast.info as ReturnType<typeof vi.fn>).mockClear();
});

describe("RiderDashboard celebration (gift-ceremony/02)", () => {
  it("claim success fires haptics.success (Stage 2 ceremony)", async () => {
    rpc.offered.mockResolvedValue({ data: [{ id: "offer-1" }], error: null });
    db.offeredFull = [offer];
    render(<RiderDashboard />);

    const accept = await screen.findByRole("button", { name: "Accept" });
    fireEvent.click(accept);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Delivery claimed.");
    });
    expect(haptics.success).toHaveBeenCalledTimes(1);
  });

  it("completing a delivery shows a run-summary banner with tabular payout (Stage 3)", async () => {
    db.deliveries = [{ ...activeDelivery }];
    render(<RiderDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /end delivery/i }));
    fireEvent.click(await screen.findByRole("button", { name: /end odometer reading/i }));

    await waitFor(() => {
      expect(screen.getByText("3.2 mi covered · D1250.00 payout")).toBeInTheDocument();
    });
    expect(haptics.success).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(".tabular-nums").length).toBeGreaterThan(0);
  });

  it("run-summary banner dismisses via close button", async () => {
    db.deliveries = [{ ...activeDelivery }];
    render(<RiderDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /end delivery/i }));
    fireEvent.click(await screen.findByRole("button", { name: /end odometer reading/i }));
    await screen.findByText("3.2 mi covered · D1250.00 payout");

    fireEvent.click(screen.getByRole("button", { name: /dismiss run summary/i }));
    expect(screen.queryByText("3.2 mi covered · D1250.00 payout")).toBeNull();
  });

  it("reject path stays a receipt — never fires haptics.success", async () => {
    rpc.offered.mockResolvedValue({ data: [{ id: "offer-1" }], error: null });
    db.offeredFull = [offer];
    render(<RiderDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm reject/i }));

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalled();
    });
    expect(haptics.success).not.toHaveBeenCalled();
  });
});
