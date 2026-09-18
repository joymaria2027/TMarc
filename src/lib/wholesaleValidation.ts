import type { CartItem } from "./cart";
import type { WholesaleQuote } from "./wholesale";

export interface WholesaleViolation {
  productId: string;
  merchantId: string;
  productName: string;
  currentQuantity: number;
  minQuantity: number;
  message: string;
}

/**
 * Validates that all cart items meet their required wholesale minimum order quantity.
 * Only applies when the buyer qualifies for wholesale pricing on the given item.
 */
export function validateWholesaleQuantities(
  items: CartItem[],
  quoteFn: (p: { id: string; merchant_id: string; price: number | string }) => WholesaleQuote
): WholesaleViolation[] {
  const violations: WholesaleViolation[] = [];

  for (const item of items) {
    const q = quoteFn({
      id: item.product_id,
      merchant_id: item.merchant_id,
      price: item.price,
    });

    if (q.isWholesale && item.quantity < q.minQty) {
      violations.push({
        productId: item.product_id,
        merchantId: item.merchant_id,
        productName: item.name,
        currentQuantity: item.quantity,
        minQuantity: q.minQty,
        message: `Minimum order for "${item.name}" is ${q.minQty} units (currently ${item.quantity}).`,
      });
    }
  }

  return violations;
}

/**
 * Maps violations by productId for direct rendering next to cart/checkout line items.
 */
export function getWholesaleQuantityErrors(
  items: CartItem[],
  quoteFn: (p: { id: string; merchant_id: string; price: number | string }) => WholesaleQuote
): Record<string, string> {
  const violations = validateWholesaleQuantities(items, quoteFn);
  const errors: Record<string, string> = {};
  for (const v of violations) {
    errors[v.productId] = v.message;
  }
  return errors;
}
