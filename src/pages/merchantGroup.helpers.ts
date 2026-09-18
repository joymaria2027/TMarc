// Shared pure helpers for the merchant/wholesale admin group.
// Extracted so grouping, pagination, filtering and inline-validation
// contracts are unit-testable without mounting supabase-backed pages.

export interface MerchantLike {
  id: string;
  business_type_id: string | null;
  manager_user_id?: string | null;
  parent_merchant_id?: string | null;
  [k: string]: unknown;
}

export interface BusinessTypeLike {
  id: string;
  name: string;
}

export interface MerchantGroup {
  id: string;
  name: string;
  items: MerchantLike[];
}

/** Slice a list into 0-based pages; out-of-range pages clamp. */
export function paginateList<T>(list: T[], page: number, pageSize: number): T[] {
  if (pageSize <= 0) return list;
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const p = Math.min(Math.max(0, page), pages - 1);
  return list.slice(p * pageSize, p * pageSize + pageSize);
}

/**
 * Visibility + grouping contract shared by MerchantsPage.
 * Admins see everything; managers see own stores + child branches.
 */
export function groupMerchants(
  merchants: MerchantLike[],
  businessTypes: BusinessTypeLike[],
  filterType: string,
  opts: { isAdmin: boolean; userId?: string },
): MerchantGroup[] {
  const { isAdmin, userId } = opts;
  const myIds = merchants.filter((m) => m.manager_user_id === userId).map((m) => m.id);
  const baseList = isAdmin
    ? merchants
    : merchants.filter(
        (m) => m.manager_user_id === userId || (m.parent_merchant_id != null && myIds.includes(m.parent_merchant_id)),
      );
  const filtered =
    filterType === "all"
      ? baseList
      : filterType === "unassigned"
        ? baseList.filter((m) => !m.business_type_id)
        : baseList.filter((m) => m.business_type_id === filterType);
  const groups: MerchantGroup[] = [];
  businessTypes.forEach((bt) => {
    const items = filtered.filter((m) => m.business_type_id === bt.id);
    if (items.length) groups.push({ id: bt.id, name: bt.name, items });
  });
  const unassigned = filtered.filter((m) => !m.business_type_id);
  if (unassigned.length) groups.push({ id: "unassigned", name: "Unassigned", items: unassigned });
  return groups;
}

export type Errors = Record<string, string>;

export function validateMerchantForm(f: { name: string; address: string; business_type_id: string }): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Name is required";
  if (!f.address.trim()) e.address = "Address is required";
  if (!f.business_type_id) e.business_type_id = "Choose a business type";
  return e;
}

const PHONE_RE = /^[+\d][\d\s-]{6,19}$/;

export function validateDeliveryForm(f: { customer_name: string; customer_phone: string; rider_id: string }): Errors {
  const e: Errors = {};
  if (!f.customer_name.trim()) e.customer_name = "Customer name is required";
  if (!PHONE_RE.test(f.customer_phone.trim())) e.customer_phone = "Enter a valid customer phone number";
  if (!f.rider_id) e.rider_id = "Choose a rider";
  return e;
}

export function validateTariffForm(f: { location_name: string; tariff_amount: string }): Errors {
  const e: Errors = {};
  if (!f.location_name.trim()) e.location_name = "Zone name is required";
  const amt = parseFloat(f.tariff_amount);
  if (!f.tariff_amount.trim() || Number.isNaN(amt) || amt <= 0) e.tariff_amount = "Enter an amount above zero";
  return e;
}

export function validateBusinessTypeForm(f: { name: string }): Errors {
  return f.name.trim() ? {} : { name: "Name is required" };
}

export function validateWholesaleApplication(f: { businessName: string }): Errors {
  return f.businessName.trim() ? {} : { businessName: "Business name is required" };
}

export function validateProductForm(f: { name: string; price: string }): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Name is required";
  const p = parseFloat(f.price);
  if (!f.price.trim() || Number.isNaN(p) || p < 0) e.price = "Enter a valid price";
  return e;
}

export interface AuditRowLike {
  id: string;
  merchant_id: string;
  event_type: string;
  actor_user_id: string;
}

/** Client-side filter contract for the audit log table. */
export function filterAuditRows<T extends AuditRowLike>(
  rows: T[],
  opts: {
    merchantFilter: string;
    eventFilter: string;
    search: string;
    merchantName: (id: string) => string;
    actorText: (id: string) => string;
  },
): T[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (opts.merchantFilter !== "all" && r.merchant_id !== opts.merchantFilter) return false;
    if (opts.eventFilter !== "all" && r.event_type !== opts.eventFilter) return false;
    if (!q) return true;
    return `${opts.merchantName(r.merchant_id)} ${opts.actorText(r.actor_user_id)} ${r.event_type}`
      .toLowerCase()
      .includes(q);
  });
}

/** Accessible label for the unread-messages status badge. */
export function unreadLabel(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 unread message" : `${count} unread messages`;
}
