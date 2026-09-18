import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DeliveriesTable from "../DeliveriesTable";
import type { DeliveryRow } from "@/lib/queries/deliveries";

const scrollIntoViewMock = vi.fn();

function makeRow(overrides: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    actual_distance_km: null,
    actual_tariff: null,
    created_at: "2026-09-18T10:00:00Z",
    customer_name: "Test Customer",
    customer_phone: "1234567",
    delivered_at: null,
    dispatched_at: null,
    dropoff_address: "Bakau Market",
    dropoff_latitude: null,
    dropoff_longitude: null,
    end_odometer_at: null,
    end_odometer_miles: null,
    end_odometer_photo_url: null,
    estimated_distance_km: null,
    estimated_tariff: 50,
    flag_reason: null,
    gps_confirmed: false,
    id: "row-1",
    is_flagged: false,
    merchant_id: "m-1",
    order_reference: "ORD-1",
    payment_bank_name: null,
    payment_method: null,
    picked_up_at: null,
    pickup_address: "Kairaba Avenue",
    pickup_latitude: null,
    pickup_longitude: null,
    receipt_attached: false,
    rider_id: null,
    route_deviation_detected: false,
    settlement_approved: false,
    settlement_approved_by: null,
    start_odometer_at: null,
    start_odometer_miles: null,
    start_odometer_photo_url: null,
    status: "dispatched",
    tariff_override_by: null,
    tariff_override_reason: null,
    updated_at: "2026-09-18T11:00:00Z",
    ...overrides,
  };
}

const noop = () => {};

function renderTable(highlightId: string | null, rows?: { unassigned: DeliveryRow[]; main: DeliveryRow[] }) {
  const unassigned = rows?.unassigned ?? [makeRow({ id: "u-1", order_reference: "ORD-U1", status: "unassigned" })];
  const main = rows?.main ?? [
    makeRow({ id: "d-1", order_reference: "ORD-1", status: "dispatched", rider_id: "r-1" }),
    makeRow({ id: "d-2", order_reference: "ORD-2", status: "delivered", rider_id: "r-2", is_flagged: true }),
  ];
  return render(
    <MemoryRouter>
      <DeliveriesTable
        unassignedRows={unassigned}
        mainRows={main}
        highlightId={highlightId}
        isRider={false}
        canDelete={false}
        rejectionCounts={{}}
        hasMore={false}
        hasMoreUnassigned={false}
        onView={noop}
        onFlag={noop}
        onUnflag={noop}
        onDelete={noop}
        onClaim={noop}
        onShowMore={noop}
        onShowMoreUnassigned={noop}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  scrollIntoViewMock.mockClear();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
});

describe("DeliveriesTable ?highlight= contract", () => {
  it("gives the matching row ring-2 ring-primary and scrolls it into view", () => {
    const { container } = renderTable("d-1");
    const row = container.querySelector('[data-delivery-id="d-1"]');
    expect(row).not.toBeNull();
    expect(row?.className).toMatch(/ring-2/);
    expect(row?.className).toMatch(/ring-primary/);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "center" });
  });

  it("ignores unknown ids silently (no highlight, no scroll)", () => {
    const { container } = renderTable("does-not-exist");
    expect(container.querySelector(".ring-2")).toBeNull();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("does nothing without a highlight id", () => {
    const { container } = renderTable(null);
    expect(container.querySelector(".ring-2")).toBeNull();
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it("highlights rows in the unassigned section too", () => {
    const { container } = renderTable("u-1");
    expect(container.querySelector('[data-delivery-id="u-1"]')?.className).toMatch(/ring-primary/);
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});

describe("DeliveriesTable actions", () => {
  it("labels icon-only buttons and shows unflag for flagged rows", () => {
    renderTable(null);
    expect(screen.getByRole("button", { name: "View delivery ORD-1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Flag delivery ORD-1" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Unflag delivery ORD-2" })).toBeDefined();
  });

  it("renders status with icon+label text", () => {
    renderTable(null);
    expect(screen.getByText("Dispatched")).toBeDefined();
    expect(screen.getByText("Delivered")).toBeDefined();
    expect(screen.getByText("Flagged")).toBeDefined();
  });

  it("shows empty states and show-more controls when applicable", () => {
    const { container } = render(
      <MemoryRouter>
        <DeliveriesTable
          unassignedRows={[]}
          mainRows={[]}
          highlightId={null}
          isRider={false}
          canDelete={false}
          rejectionCounts={{}}
          hasMore
          hasMoreUnassigned
          onView={noop}
          onFlag={noop}
          onUnflag={noop}
          onDelete={noop}
          onClaim={noop}
          onShowMore={noop}
          onShowMoreUnassigned={noop}
        />
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("All deliveries currently assigned.");
    expect(container.textContent).toContain("No deliveries found");
    expect(container.textContent).toContain("Show more unassigned");
    expect(container.textContent).toContain("Show more");
  });
});
