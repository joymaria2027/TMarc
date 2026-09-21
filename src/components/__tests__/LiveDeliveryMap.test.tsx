import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import LiveDeliveryMap from "../LiveDeliveryMap";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
  },
}));

// Skip Leaflet entirely: lock LiveDeliveryMap's contract, not the map tiles.
vi.mock("../DeliveryMap", () => ({
  default: () => <div data-testid="delivery-map" />,
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const liveRow = {
  latitude: 13.452,
  longitude: -16.578,
  recorded_at: new Date().toISOString(),
  pickup_lat: 13.45,
  pickup_lng: -16.57,
  dropoff_lat: 13.46,
  dropoff_lng: -16.58,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiveDeliveryMap states", () => {
  it("shows the waiting state when the RPC returns no rows", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    render(<LiveDeliveryMap orderId="order-1" />);
    expect(await screen.findByText("No live location yet")).toBeTruthy();
    expect(screen.queryByTestId("delivery-map")).toBeNull();
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
  });

  it("renders the map when the RPC returns a live row", async () => {
    rpcMock.mockResolvedValue({ data: [liveRow], error: null });
    render(<LiveDeliveryMap orderId="order-1" deliveryId="delivery-1" />);
    expect(await screen.findByTestId("delivery-map")).toBeTruthy();
  });

  it("shows a retryable error — not the waiting state — when the RPC fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Not authorized", code: "P0001" },
    });
    render(<LiveDeliveryMap orderId="order-1" />);
    expect(await screen.findByText(/couldn't load/i)).toBeTruthy();
    expect(screen.queryByTestId("delivery-map")).toBeNull();
    expect(screen.queryByText("No live location yet")).toBeNull();
    // The server error must be surfaced for diagnostics, not swallowed.
    expect(errSpy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText(/couldn't load/i)).toBeTruthy();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
