import { useEffect, useState } from "react";

export interface CartItem {
  product_id: string;
  merchant_id: string;
  merchant_name?: string;
  name: string;
  price: number;
  quantity: number;
  image_path?: string | null;
  /** Set when a wholesale-eligible buyer explicitly chose the standard (retail)
   *  price on the product page; cart/checkout minimum-quantity validation
   *  skips such lines. Absent for normal (wholesale-priced) lines. */
  pricingMode?: "retail";
}

const KEY = "delivery-ace-cart-v1";

export function loadCart(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function saveCart(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("cart-updated"));
}

export function groupByMerchant(items: CartItem[]): Record<string, CartItem[]> {
  const out: Record<string, CartItem[]> = {};
  for (const i of items) {
    (out[i.merchant_id] ||= []).push(i);
  }
  return out;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  useEffect(() => {
    const f = () => setItems(loadCart());
    window.addEventListener("cart-updated", f);
    window.addEventListener("storage", f);
    return () => {
      window.removeEventListener("cart-updated", f);
      window.removeEventListener("storage", f);
    };
  }, []);

  const add = (item: CartItem) => {
    const cur = loadCart();
    const existing = cur.find(c => c.product_id === item.product_id);
    if (existing) {
      existing.quantity += item.quantity;
      // A wholesale-priced line re-prices the merged line (the buyer is
      // eligible and the accumulated quantity meets the minimum); a
      // retail-flagged line never overrides an existing wholesale price.
      if (!item.pricingMode) {
        existing.price = item.price;
        delete existing.pricingMode;
      }
      saveCart([...cur]);
    } else {
      saveCart([...cur, item]);
    }
  };
  const remove = (product_id: string) => saveCart(loadCart().filter(c => c.product_id !== product_id));
  const setQty = (product_id: string, qty: number) => {
    const cur = loadCart().map(c => c.product_id === product_id ? { ...c, quantity: Math.max(1, qty) } : c);
    saveCart(cur);
  };
  const clear = () => saveCart([]);
  // Removes all items belonging to one merchant (used by checkout partial-failure recovery
  // so already-created orders can't be duplicated on retry).
  const removeMerchant = (merchant_id: string) => saveCart(loadCart().filter(c => c.merchant_id !== merchant_id));
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const groups = groupByMerchant(items);

  return { items, add, remove, setQty, clear, removeMerchant, subtotal, groups };
}
