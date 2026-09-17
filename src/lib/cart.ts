import { useEffect, useState } from "react";

export interface CartItem {
  product_id: string;
  merchant_id: string;
  merchant_name?: string;
  name: string;
  price: number;
  quantity: number;
  image_path?: string | null;
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
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const groups = groupByMerchant(items);

  return { items, add, remove, setQty, clear, subtotal, groups };
}
