import { describe, it, expect } from "vitest";
import { filterOrders, isActiveOrder, type FilterableOrder } from "../orderGroups";

interface TestOrder extends FilterableOrder {
  id: string;
}

const orders: TestOrder[] = [
  { id: "1", status: "in_transit", order_reference: "DG-1001", merchants: { name: "Kairaba Kitchen" } },
  { id: "2", status: "pending_payment", order_reference: "DG-1002", merchants: { name: "Serekunda Grill" } },
  { id: "3", status: "delivered", order_reference: "DG-1003", merchants: { name: "Kairaba Kitchen" } },
  { id: "4", status: "cancelled", order_reference: "DG-1004", merchants: { name: "Bakau Fish" } },
];

describe("isActiveOrder", () => {
  it("treats tracking states as active, delivered/cancelled/refunded as past", () => {
    expect(isActiveOrder("pending_payment")).toBe(true);
    expect(isActiveOrder("in_transit")).toBe(true);
    expect(isActiveOrder("delivered")).toBe(false);
    expect(isActiveOrder("cancelled")).toBe(false);
    expect(isActiveOrder("refunded")).toBe(false);
  });
});

describe("filterOrders (My orders tabs + search)", () => {
  it("returns all on all-tab with empty query", () => {
    expect(filterOrders(orders, { tab: "all", query: "" })).toHaveLength(4);
  });

  it("splits active vs past", () => {
    expect(filterOrders(orders, { tab: "active", query: "" }).map((o) => o.id)).toEqual(["1", "2"]);
    expect(filterOrders(orders, { tab: "past", query: "" }).map((o) => o.id)).toEqual(["3", "4"]);
  });

  it("matches reference or merchant name case-insensitively", () => {
    expect(filterOrders(orders, { tab: "all", query: "kairaba" }).map((o) => o.id)).toEqual(["1", "3"]);
    expect(filterOrders(orders, { tab: "all", query: "dg-1002" }).map((o) => o.id)).toEqual(["2"]);
  });

  it("combines tab + query", () => {
    expect(filterOrders(orders, { tab: "active", query: "kairaba" }).map((o) => o.id)).toEqual(["1"]);
  });
});
