import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
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
    rider_id: "r-1",
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
    merchants: { name: "Acme Store" },
    ...overrides,
  };
}

const noop = () => {};

function renderTable(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function tableOf(main: DeliveryRow[], unassigned: DeliveryRow[] = []) {
  return (
    <DeliveriesTable
      unassignedRows={unassigned}
      mainRows={main}
      highlightId={null}
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
  );
}

function mainOrder(container: HTMLElement): string[] {
  const body = container.querySelector('tbody[aria-label="Assigned deliveries"]');
  if (!body) return [];
  return [...body.querySelectorAll("[data-delivery-id]")].map((el) =>
    el.getAttribute("data-delivery-id"),
  ) as string[];
}

beforeEach(() => {
  scrollIntoViewMock.mockClear();
  window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
});

describe("DeliveriesTable sortable columns", () => {
  it("exposes Time/Tariff/Status/Merchant/Rider headers as sort buttons with aria-sort=none by default", () => {
    const { container } = renderTable(tableOf([makeRow()]));
    for (const [header, key] of [
      ["Status", "Status"],
      ["Tariff", "Tariff"],
      ["Updated", "Updated"],
      ["Merchant", "Merchant"],
      ["Rider", "Rider"],
    ] as const) {
      const th = screen.getByRole("columnheader", { name: header });
      expect(th.getAttribute("aria-sort")).toBe("none");
      expect(within(th).getByRole("button", { name: `Sort by ${key}` })).toBeDefined();
    }
    // Non-sortable headers carry no aria-sort.
    expect(
      screen.getByRole("columnheader", { name: "Reference" }).getAttribute("aria-sort"),
    ).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Flag" }).getAttribute("aria-sort"),
    ).toBeNull();
    expect(container.querySelector('tbody[aria-label="Assigned deliveries"]')?.textContent).toContain(
      "ORD-1",
    );
  });

  it("keeps default order = rows as received before any sort", () => {
    const { container } = renderTable(
      tableOf([
        makeRow({ id: "c", order_reference: "ORD-C", estimated_tariff: 5 }),
        makeRow({ id: "a", order_reference: "ORD-A", estimated_tariff: 100 }),
        makeRow({ id: "b", order_reference: "ORD-B", estimated_tariff: 20 }),
      ]),
    );
    expect(mainOrder(container)).toEqual(["c", "a", "b"]);
  });

  it("cycles Tariff asc -> desc -> default with correct aria-sort and row order", () => {
    const { container } = renderTable(
      tableOf([
        makeRow({ id: "c", order_reference: "ORD-C", estimated_tariff: 5 }),
        makeRow({ id: "a", order_reference: "ORD-A", estimated_tariff: 100 }),
        makeRow({ id: "b", order_reference: "ORD-B", estimated_tariff: 20 }),
      ]),
    );
    const th = screen.getByRole("columnheader", { name: "Tariff" });
    const btn = within(th).getByRole("button", { name: /Sort by Tariff/ });

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("ascending");
    expect(mainOrder(container)).toEqual(["c", "b", "a"]);

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("descending");
    expect(mainOrder(container)).toEqual(["a", "b", "c"]);

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("none");
    expect(mainOrder(container)).toEqual(["c", "a", "b"]);
  });

  it("sorts by Time and Status, resetting to asc when switching columns", () => {
    const { container } = renderTable(
      tableOf([
        makeRow({ id: "s1", status: "delivered", updated_at: "2026-09-18T12:00:00Z" }),
        makeRow({ id: "s2", status: "pending", updated_at: "2026-09-18T09:00:00Z" }),
      ]),
    );
    const timeTh = screen.getByRole("columnheader", { name: "Updated" });
    fireEvent.click(within(timeTh).getByRole("button", { name: /Sort by Updated/ }));
    expect(timeTh.getAttribute("aria-sort")).toBe("ascending");
    expect(mainOrder(container)).toEqual(["s2", "s1"]);

    const statusTh = screen.getByRole("columnheader", { name: "Status" });
    fireEvent.click(within(statusTh).getByRole("button", { name: /Sort by Status/ }));
    expect(statusTh.getAttribute("aria-sort")).toBe("ascending");
    expect(timeTh.getAttribute("aria-sort")).toBe("none");
    expect(mainOrder(container)).toEqual(["s2", "s1"]);
  });

  it("cycles Merchant asc -> desc -> default with correct aria-sort and row order", () => {
    const { container } = renderTable(
      tableOf([
        makeRow({ id: "c", order_reference: "ORD-C", merchants: { name: "Zebra Store" } }),
        makeRow({ id: "a", order_reference: "ORD-A", merchants: { name: "Alpha Store" } }),
        makeRow({ id: "b", order_reference: "ORD-B", merchants: { name: "Beta Store" } }),
      ]),
    );
    const th = screen.getByRole("columnheader", { name: "Merchant" });
    const btn = within(th).getByRole("button", { name: /Sort by Merchant/ });

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("ascending");
    expect(mainOrder(container)).toEqual(["a", "b", "c"]);

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("descending");
    expect(mainOrder(container)).toEqual(["c", "b", "a"]);

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("none");
    expect(mainOrder(container)).toEqual(["c", "a", "b"]);
  });

  it("cycles Rider asc -> desc -> default with correct aria-sort and row order", () => {
    const { container } = renderTable(
      tableOf([
        makeRow({ id: "c", order_reference: "ORD-C", rider_id: "rider-z" }),
        makeRow({ id: "a", order_reference: "ORD-A", rider_id: "rider-a" }),
        makeRow({ id: "b", order_reference: "ORD-B", rider_id: "rider-b" }),
      ]),
    );
    const th = screen.getByRole("columnheader", { name: "Rider" });
    const btn = within(th).getByRole("button", { name: /Sort by Rider/ });

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("ascending");
    expect(mainOrder(container)).toEqual(["a", "b", "c"]);

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("descending");
    expect(mainOrder(container)).toEqual(["c", "b", "a"]);

    fireEvent.click(btn);
    expect(th.getAttribute("aria-sort")).toBe("none");
    expect(mainOrder(container)).toEqual(["c", "a", "b"]);
  });

  it("sorts Merchant and Rider, placing empty values last in asc and first in desc", () => {
    const { container } = renderTable(
      tableOf([
        makeRow({ id: "empty-m", merchants: { name: "" }, rider_id: "" }),
        makeRow({ id: "a-m", merchants: { name: "Alpha" }, rider_id: "rider-a" }),
        makeRow({ id: "b-m", merchants: { name: "Beta" }, rider_id: "rider-b" }),
      ]),
    );

    // Merchant asc: empty last
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Merchant" })).getByRole("button", { name: /Sort by Merchant/ }));
    expect(mainOrder(container)).toEqual(["a-m", "b-m", "empty-m"]);

    // Merchant desc: empty first
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Merchant" })).getByRole("button", { name: /Sort by Merchant/ }));
    expect(mainOrder(container)).toEqual(["empty-m", "b-m", "a-m"]);

    // Reset
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Merchant" })).getByRole("button", { name: /Sort by Merchant/ }));
    expect(mainOrder(container)).toEqual(["empty-m", "a-m", "b-m"]);

    // Rider asc: empty last
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Rider" })).getByRole("button", { name: /Sort by Rider/ }));
    expect(mainOrder(container)).toEqual(["a-m", "b-m", "empty-m"]);

    // Rider desc: empty first
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Rider" })).getByRole("button", { name: /Sort by Rider/ }));
    expect(mainOrder(container)).toEqual(["empty-m", "b-m", "a-m"]);
  });

  it("sorts the unassigned section with the same sort state", () => {
    const { container } = renderTable(
      tableOf([], [
        makeRow({ id: "u2", order_reference: "ORD-U2", status: "unassigned", rider_id: null, estimated_tariff: 30 }),
        makeRow({ id: "u1", order_reference: "ORD-U1", status: "unassigned", rider_id: null, estimated_tariff: 10 }),
      ]),
    );
    const th = screen.getByRole("columnheader", { name: "Tariff" });
    fireEvent.click(within(th).getByRole("button", { name: /Sort by Tariff/ }));
    const body = container.querySelector('tbody[aria-label="Unassigned deliveries"]');
    const order = [...(body?.querySelectorAll("[data-delivery-id]") ?? [])].map((el) =>
      el.getAttribute("data-delivery-id"),
    );
    expect(order).toEqual(["u1", "u2"]);
  });

  it("keeps tabular-nums on tariff and time cells", () => {
    const { container } = renderTable(tableOf([makeRow()]));
    expect(container.querySelector("td.tabular-nums")).not.toBeNull();
  });
});

describe("DeliveriesTable merchant deep-links", () => {
  it("links the merchant cell to /merchants?highlight=<id> when an id exists", () => {
    renderTable(tableOf([makeRow({ merchant_id: "m-42", merchants: { name: "Acme Store" } })]));
    const link = screen.getByRole("link", { name: "Acme Store" });
    expect(link.getAttribute("href")).toBe("/merchants?highlight=m-42");
  });

  it("renders plain text when no merchant id exists", () => {
    const { container } = renderTable(
      tableOf([makeRow({ merchant_id: "", merchants: { name: "Acme Store" } })]),
    );
    expect(screen.getByText("Acme Store").tagName).toBe("SPAN");
    expect(container.querySelector('a[href^="/merchants"]')).toBeNull();
  });

  it("tolerates a denormalized merchant_name and dashes when absent", () => {
    const withName = { ...makeRow({ id: "n1", merchants: null }), ...{ merchant_name: "Corner Shop" } };
    const withoutAny = { ...makeRow({ id: "n2", merchants: null }), ...{ merchant_name: null } };
    const { container } = renderTable(tableOf([withName, withoutAny]));
    expect(screen.getByRole("link", { name: "Corner Shop" }).getAttribute("href")).toBe(
      "/merchants?highlight=m-1",
    );
    const dashRow = container.querySelector('[data-delivery-id="n2"]');
    expect(dashRow).not.toBeNull();
    // Id exists so the dash still links to the merchant highlight.
    const dashLink = within(dashRow as HTMLElement).getByRole("link", { name: "–" });
    expect(dashLink.getAttribute("href")).toBe("/merchants?highlight=m-1");
  });
});
