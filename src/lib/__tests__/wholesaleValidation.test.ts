import { describe, it, expect } from "vitest";
import { validateWholesaleQuantities, getWholesaleQuantityErrors } from "../wholesaleValidation";
import type { CartItem } from "../cart";
import type { WholesaleQuote } from "../wholesale";

describe("wholesaleValidation (cart & checkout min-quantity guards)", () => {
  const mockQuoteFn = (item: { id: string; merchant_id: string; price: number | string }): WholesaleQuote => {
    // p1: wholesale active with minQty 5
    if (item.id === "p1") {
      return { price: 80, retailPrice: 100, minQty: 5, isWholesale: true };
    }
    // p2: wholesale active with minQty 10
    if (item.id === "p2") {
      return { price: 40, retailPrice: 50, minQty: 10, isWholesale: true };
    }
    // p3: retail only (no wholesale discount, minQty 1)
    return { price: 25, retailPrice: 25, minQty: 1, isWholesale: false };
  };

  it("passes when all wholesale items meet or exceed min quantity", () => {
    const items: CartItem[] = [
      { product_id: "p1", merchant_id: "m1", name: "Flour 50kg", price: 80, quantity: 5 },
      { product_id: "p2", merchant_id: "m1", name: "Sugar 25kg", price: 40, quantity: 12 },
      { product_id: "p3", merchant_id: "m1", name: "Salt 1kg", price: 25, quantity: 1 },
    ];

    const violations = validateWholesaleQuantities(items, mockQuoteFn);
    expect(violations).toHaveLength(0);
    expect(getWholesaleQuantityErrors(items, mockQuoteFn)).toEqual({});
  });

  it("fails when wholesale item is below required min quantity with a clear error message", () => {
    const items: CartItem[] = [
      { product_id: "p1", merchant_id: "m1", name: "Flour 50kg", price: 80, quantity: 3 }, // min 5
      { product_id: "p3", merchant_id: "m1", name: "Salt 1kg", price: 25, quantity: 1 }, // retail, min 1
    ];

    const violations = validateWholesaleQuantities(items, mockQuoteFn);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      productId: "p1",
      merchantId: "m1",
      productName: "Flour 50kg",
      currentQuantity: 3,
      minQuantity: 5,
      message: 'Minimum order for "Flour 50kg" is 5 units (currently 3).',
    });

    const errMap = getWholesaleQuantityErrors(items, mockQuoteFn);
    expect(errMap["p1"]).toBe('Minimum order for "Flour 50kg" is 5 units (currently 3).');
    expect(errMap["p3"]).toBeUndefined();
  });

  it("flags multiple wholesale items violating their individual minimums", () => {
    const items: CartItem[] = [
      { product_id: "p1", merchant_id: "m1", name: "Flour 50kg", price: 80, quantity: 2 }, // min 5
      { product_id: "p2", merchant_id: "m1", name: "Sugar 25kg", price: 40, quantity: 4 }, // min 10
    ];

    const violations = validateWholesaleQuantities(items, mockQuoteFn);
    expect(violations).toHaveLength(2);
    expect(violations[0].minQuantity).toBe(5);
    expect(violations[1].minQuantity).toBe(10);
  });

  it("ignores non-wholesale retail shoppers even if quantity is 1", () => {
    const retailQuoteFn = (item: { id: string; price: number | string }): WholesaleQuote => ({
      price: Number(item.price),
      retailPrice: Number(item.price),
      minQty: 1,
      isWholesale: false,
    });

    const items: CartItem[] = [
      { product_id: "p1", merchant_id: "m1", name: "Flour 50kg", price: 100, quantity: 1 },
    ];

    const violations = validateWholesaleQuantities(items, retailQuoteFn);
    expect(violations).toHaveLength(0);
  });

  it("skips minimum validation for lines the buyer explicitly bought at retail (PDP variant choice)", () => {
    // A wholesale-eligible buyer chose STANDARD PRICE on the product page:
    // the line is priced at retail and flagged, so the wholesale minimum
    // must not apply even though the quote would demand 5 units.
    const items: CartItem[] = [
      { product_id: "p1", merchant_id: "m1", name: "Flour 50kg", price: 100, quantity: 1, pricingMode: "retail" },
    ];

    const violations = validateWholesaleQuantities(items, mockQuoteFn);
    expect(violations).toHaveLength(0);
    expect(getWholesaleQuantityErrors(items, mockQuoteFn)).toEqual({});
  });

  it("still enforces minimums for unflagged wholesale lines mixed with retail-flagged ones", () => {
    const items: CartItem[] = [
      { product_id: "p1", merchant_id: "m1", name: "Flour 50kg", price: 100, quantity: 2 }, // unflagged → violation (min 5)
      { product_id: "p2", merchant_id: "m1", name: "Sugar 25kg", price: 50, quantity: 3, pricingMode: "retail" }, // flagged → skipped
    ];

    const violations = validateWholesaleQuantities(items, mockQuoteFn);
    expect(violations).toHaveLength(1);
    expect(violations[0].productId).toBe("p1");
  });
});
