import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  paginateList,
  groupMerchants,
  validateMerchantForm,
  validateDeliveryForm,
  validateTariffForm,
  validateBusinessTypeForm,
  validateWholesaleApplication,
  validateProductForm,
  filterAuditRows,
  unreadLabel,
} from "../merchantGroup.helpers";

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, `../${f}`), "utf8");

const GROUP = [
  "MerchantsPage.tsx",
  "MerchantProductsPage.tsx",
  "MerchantOrdersPage.tsx",
  "MerchantAuditLogPage.tsx",
  "BusinessTypesPage.tsx",
  "WholesalersPage.tsx",
  "WholesaleApplyPage.tsx",
  "ProductApprovalsPage.tsx",
  "MerchantStorefrontPage.tsx",
];

// P1: no window.prompt / window.confirm / bare confirm( in group
describe("no native prompt/confirm in group", () => {
  for (const f of GROUP) {
    it(`${f} has no window.prompt/confirm`, () => {
      const src = read(f);
      expect(src).not.toMatch(/window\.prompt/);
      expect(src).not.toMatch(/window\.confirm/);
      expect(src).not.toMatch(/(^|[^\w.])confirm\s*\(/);
    });
  }
});

// P1: AlertDialog replaces confirm for destructive flows
describe("AlertDialog confirmations", () => {
  for (const f of ["MerchantsPage.tsx", "MerchantProductsPage.tsx", "BusinessTypesPage.tsx"]) {
    it(`${f} uses AlertDialog`, () => {
      const src = read(f);
      expect(src).toMatch(/AlertDialog/);
    });
  }
});

// P1: every <Label> is programmatically associated
describe("Label htmlFor associations", () => {
  for (const f of GROUP) {
    it(`${f} labels all carry htmlFor`, () => {
      const src = read(f);
      const opens = src.match(/<Label[\s>]/g) || [];
      const withFor = src.match(/<Label[^>]*htmlFor=/g) || [];
      expect(`${opens.length} vs ${withFor.length}`).toBe(`${opens.length} vs ${opens.length}`);
    });
  }
});

// P1/P2: dialogs carry descriptions, scroll safely, stack on small screens
describe("dialog a11y + responsive", () => {
  for (const f of GROUP) {
    it(`${f} dialogs have descriptions when present`, () => {
      const src = read(f);
      const contents = (src.match(/<DialogContent/g) || []).length;
      const descs = (src.match(/<DialogDescription/g) || []).length;
      const alertDescs = (src.match(/<AlertDialogDescription/g) || []).length;
      if (contents > 0) expect(descs + alertDescs).toBeGreaterThanOrEqual(contents);
    });
  }
  it("MerchantsPage dialogs scroll + single-col under sm", () => {
    const src = read("MerchantsPage.tsx");
    expect(src).toMatch(/max-h-\[90vh\] overflow-y-auto/);
    expect(src).toMatch(/grid-cols-1 sm:grid-cols-2/);
  });
  it("MerchantProductsPage dialogs scroll + single-col under sm", () => {
    const src = read("MerchantProductsPage.tsx");
    expect(src).toMatch(/max-h-\[90vh\] overflow-y-auto/);
    expect(src).toMatch(/grid-cols-1 sm:grid-cols-2/);
  });
});

// P1: loading regions are announced
describe("role=status loading", () => {
  for (const f of GROUP) {
    it(`${f} announces loading`, () => {
      const src = read(f);
      if (/Loading|animate-spin|loading/i.test(src)) {
        expect(src).toMatch(/role="status"/);
      }
    });
  }
});

// P1: icon-only targets labelled
describe("icon button labels", () => {
  it("MerchantsPage icon buttons have aria-labels", () => {
    const src = read("MerchantsPage.tsx");
    expect(src).not.toMatch(/<button onClick[^>]*>×<\/button>/);
    expect(src).toMatch(/aria-label=\{?["`]Remove rider/);
  });
  it("MerchantProductsPage delete has aria-label", () => {
    expect(read("MerchantProductsPage.tsx")).toMatch(/aria-label=\{?["`]Delete product/);
  });
  it("audit pagination buttons labelled", () => {
    const src = read("MerchantAuditLogPage.tsx");
    expect(src).toMatch(/aria-label="Previous audit page"/);
    expect(src).toMatch(/aria-label="Next audit page"/);
  });
});

// P1: chat must not auto-open
describe("merchant chat behaviour", () => {
  it("does not auto-open on unread", () => {
    const src = read("MerchantOrdersPage.tsx");
    expect(src).not.toMatch(/if \(unread > 0 && !chatOpen\) setChatOpen\(true\)/);
    expect(src).toMatch(/role="status"/);
  });
});

// P1: single link per storefront card
describe("storefront card links", () => {
  it("duplicate title link is keyboard-skipped", () => {
    expect(read("MerchantStorefrontPage.tsx")).toMatch(/tabIndex=\{-1\}/);
  });
  it("description renders conditionally", () => {
    expect(read("MerchantStorefrontPage.tsx")).toMatch(/\{p\.description &&/);
  });
});

// P2: tables for tabular admin surfaces
describe("tables for tabular data", () => {
  for (const f of ["BusinessTypesPage.tsx", "WholesalersPage.tsx", "MerchantAuditLogPage.tsx"]) {
    it(`${f} renders a Table`, () => {
      const src = read(f);
      expect(src).toMatch(/<Table/);
    });
  }
  it("storefront keeps commerce cards", () => {
    expect(read("MerchantStorefrontPage.tsx")).toMatch(/<Card/);
  });
});

// P2: collapsible audit JSON
describe("audit detail disclosure", () => {
  it("audit log uses Collapsible for JSON", () => {
    const src = read("MerchantAuditLogPage.tsx");
    expect(src).toMatch(/Collapsible/);
  });
});

// P2: admin sans discipline (font-display only on storefront surfaces)
describe("type discipline", () => {
  for (const f of [
    "MerchantsPage.tsx",
    "MerchantProductsPage.tsx",
    "MerchantOrdersPage.tsx",
    "MerchantAuditLogPage.tsx",
    "BusinessTypesPage.tsx",
    "WholesalersPage.tsx",
    "ProductApprovalsPage.tsx",
  ]) {
    it(`${f} has no font-display/font-mono`, () => {
      const src = read(f);
      expect(src).not.toMatch(/font-display/);
      expect(src).not.toMatch(/font-mono/);
    });
  }
  for (const f of ["MerchantStorefrontPage.tsx", "WholesaleApplyPage.tsx"]) {
    it(`${f} (brand) may keep font-display`, () => {
      expect(read(f)).toMatch(/font-display/);
    });
  }
});

// P2: images lazy + sized, cached helper retained
describe("product images", () => {
  it("approvals images lazy + sized", () => {
    const src = read("ProductApprovalsPage.tsx");
    expect(src).toMatch(/loading="lazy"/);
    expect(src).toMatch(/width=\{128\}[\s\S]*height=\{128\}/);
    expect(src).toMatch(/getProductImageUrl/);
  });
  it("storefront images lazy + sized", () => {
    const src = read("MerchantStorefrontPage.tsx");
    expect(src).toMatch(/loading="lazy"/);
    expect(src).toMatch(/width=\{400\} height=\{300\}/);
  });
});

// P2: decorative icons hidden
describe("aria-hidden decorative icons", () => {
  it("MerchantsPage decorative icons hidden", () => {
    expect(read("MerchantsPage.tsx")).toMatch(/aria-hidden="true"/);
  });
  it("storefront MapPin hidden", () => {
    expect(read("MerchantStorefrontPage.tsx")).toMatch(/aria-hidden="true"/);
  });
});

// P1: scoped + debounced realtime, pagination, memoization
describe("realtime + pagination contracts", () => {
  it("MerchantsPage debounces realtime reloads", () => {
    expect(read("MerchantsPage.tsx")).toMatch(/debounce/i);
  });
  it("MerchantsPage paginates", () => {
    expect(read("MerchantsPage.tsx")).toMatch(/MERCHANT_PAGE_SIZE|visibleCount|setPage/);
  });
  it("MerchantsPage memoizes tariff grouping", () => {
    expect(read("MerchantsPage.tsx")).toMatch(/useMemo/);
  });
  it("MerchantOrdersPage paginates + debounces", () => {
    const src = read("MerchantOrdersPage.tsx");
    expect(src).toMatch(/ORDER_PAGE_SIZE/);
    expect(src).toMatch(/debounce/i);
  });
  it("MerchantProductsPage scopes realtime to merchant", () => {
    expect(read("MerchantProductsPage.tsx")).toMatch(/merchant_id/);
  });
});

// ---- pure helper contracts (impacted callers) ----
describe("paginateList", () => {
  const list = [1, 2, 3, 4, 5];
  it("slices pages", () => {
    expect(paginateList(list, 0, 2)).toEqual([1, 2]);
    expect(paginateList(list, 1, 2)).toEqual([3, 4]);
    expect(paginateList(list, 2, 2)).toEqual([5]);
  });
  it("clamps out-of-range pages", () => {
    expect(paginateList(list, 9, 2)).toEqual([5]);
    expect(paginateList(list, -1, 2)).toEqual([1, 2]);
  });
});

describe("groupMerchants", () => {
  const merchants = [
    { id: "m1", name: "A", business_type_id: "t1", manager_user_id: "u1", parent_merchant_id: null },
    { id: "m2", name: "B", business_type_id: null, manager_user_id: "u2", parent_merchant_id: null },
    { id: "m3", name: "C", business_type_id: "t1", manager_user_id: "u1", parent_merchant_id: "m1" },
  ];
  const types = [{ id: "t1", name: "Food" }];
  it("groups admin view by type + unassigned", () => {
    const g = groupMerchants(merchants, types, "all", { isAdmin: true, userId: "x" });
    expect(g.map((x) => x.id)).toEqual(["t1", "unassigned"]);
    expect(g[0].items.map((x: { id: string }) => x.id)).toEqual(["m1", "m3"]);
  });
  it("restricts managers to own + child branches", () => {
    const g = groupMerchants(merchants, types, "all", { isAdmin: false, userId: "u1" });
    expect(g.flatMap((x) => x.items.map((i: { id: string }) => i.id)).sort()).toEqual(["m1", "m3"]);
  });
  it("filters by type", () => {
    const g = groupMerchants(merchants, types, "unassigned", { isAdmin: true, userId: "x" });
    expect(g).toHaveLength(1);
    expect(g[0].items.map((i: { id: string }) => i.id)).toEqual(["m2"]);
  });
});

describe("form validators (inline errors, not toast-only)", () => {
  it("merchant form requires name/address/type", () => {
    expect(validateMerchantForm({ name: "", address: "", business_type_id: "" })).toEqual({
      name: "Name is required",
      address: "Address is required",
      business_type_id: "Choose a business type",
    });
    expect(validateMerchantForm({ name: "A", address: "B", business_type_id: "t" })).toEqual({});
  });
  it("delivery form requires customer + rider + phone", () => {
    const e = validateDeliveryForm({ customer_name: "", customer_phone: "bad", rider_id: "" });
    expect(e.customer_name).toMatch(/required/);
    expect(e.customer_phone).toMatch(/valid/);
    expect(e.rider_id).toMatch(/rider/);
    expect(validateDeliveryForm({ customer_name: "A", customer_phone: "+2201234567", rider_id: "r" })).toEqual({});
  });
  it("tariff form requires zone + positive amount", () => {
    expect(validateTariffForm({ location_name: "", tariff_amount: "" }).location_name).toBeTruthy();
    expect(validateTariffForm({ location_name: "Z", tariff_amount: "-1" }).tariff_amount).toBeTruthy();
    expect(validateTariffForm({ location_name: "Z", tariff_amount: "10" })).toEqual({});
  });
  it("business type requires name", () => {
    expect(validateBusinessTypeForm({ name: "  " })).toEqual({ name: "Name is required" });
    expect(validateBusinessTypeForm({ name: "Pharmacy" })).toEqual({});
  });
  it("wholesale application requires business name", () => {
    expect(validateWholesaleApplication({ businessName: "" })).toEqual({ businessName: "Business name is required" });
    expect(validateWholesaleApplication({ businessName: "Acme" })).toEqual({});
  });
  it("product form requires name + price", () => {
    const e = validateProductForm({ name: "", price: "" });
    expect(e.name).toBeTruthy();
    expect(e.price).toBeTruthy();
    expect(validateProductForm({ name: "Rice", price: "10" })).toEqual({});
  });
});

describe("filterAuditRows", () => {
  const rows = [
    { id: "1", merchant_id: "m1", event_type: "qr_viewed", actor_user_id: "u1" },
    { id: "2", merchant_id: "m2", event_type: "submerchant_created", actor_user_id: "u2" },
  ];
  const ctx = {
    merchantName: (id: string) => (id === "m1" ? "Shop A" : "Shop B"),
    actorText: (id: string) => (id === "u1" ? "Ada" : "Bo"),
  };
  it("filters by merchant + event + search", () => {
    expect(filterAuditRows(rows, { merchantFilter: "m1", eventFilter: "all", search: "", ...ctx })).toHaveLength(1);
    expect(filterAuditRows(rows, { merchantFilter: "all", eventFilter: "qr_viewed", search: "", ...ctx })).toHaveLength(1);
    expect(filterAuditRows(rows, { merchantFilter: "all", eventFilter: "all", search: "bo", ...ctx })).toHaveLength(1);
  });
});

describe("unreadLabel (role=status badge)", () => {
  it("labels counts for AT", () => {
    expect(unreadLabel(0)).toBe("");
    expect(unreadLabel(3)).toBe("3 unread messages");
    expect(unreadLabel(1)).toBe("1 unread message");
  });
});
