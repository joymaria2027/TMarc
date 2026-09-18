import { describe, it, expect } from "vitest";
import {
  buildDeliverySearchOr,
  describeDeliveryResultCount,
  escapePostgrestLikePattern,
  isDeliverySearchActive,
  normalizeDeliverySearchQuery,
  rowMatchesDeliverySearch,
} from "../deliverySearch";
import {
  fetchDeliveriesCount,
  fetchDeliveriesPage,
  fetchMerchantIdsByName,
  fetchUnassignedPage,
} from "@/lib/queries/deliveries";

// Recording supabase stub (mirrors src/lib/queries/__tests__/queries.test.ts):
// every chainable returns the proxy, `range` resolves the canned result, and
// awaiting the builder resolves the same result via `then`.
function recordingClient(result: unknown) {
  const calls: string[] = [];
  const show = (a: unknown) => JSON.stringify(a);
  const target: Record<string, (...args: unknown[]) => unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop: string | symbol) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
      return (...args: unknown[]) => {
        calls.push(`${String(prop)}(${args.map(show).join(",")})`);
        if (prop === "range") return Promise.resolve(result);
        return proxy;
      };
    },
  });
  const client = {
    from: (table: string) => {
      calls.push(`from(${table})`);
      return proxy;
    },
  };
  return { client, calls };
}

const asClient = (c: unknown) => c as Parameters<typeof fetchDeliveriesPage>[0]["client"];

describe("normalizeDeliverySearchQuery", () => {
  it("trims whitespace and passes inner text through", () => {
    expect(normalizeDeliverySearchQuery("  ORD-42 ")).toBe("ORD-42");
    expect(normalizeDeliverySearchQuery("kairaba")).toBe("kairaba");
  });

  it("maps null/undefined/blank to empty", () => {
    expect(normalizeDeliverySearchQuery(null)).toBe("");
    expect(normalizeDeliverySearchQuery(undefined)).toBe("");
    expect(normalizeDeliverySearchQuery("   ")).toBe("");
  });
});

describe("isDeliverySearchActive", () => {
  it("is inactive for empty or blank queries", () => {
    expect(isDeliverySearchActive("")).toBe(false);
    expect(isDeliverySearchActive("   ")).toBe(false);
    expect(isDeliverySearchActive(null)).toBe(false);
    expect(isDeliverySearchActive(undefined)).toBe(false);
  });

  it("is active for any non-blank query", () => {
    expect(isDeliverySearchActive("ord")).toBe(true);
    expect(isDeliverySearchActive("  ord  ")).toBe(true);
  });
});

describe("escapePostgrestLikePattern", () => {
  it("escapes LIKE specials (backslash first)", () => {
    expect(escapePostgrestLikePattern("100%_x\\y")).toBe("100\\%\\_x\\\\y");
  });

  it("maps or()-syntax breakers (comma/parens) to single-char wildcards", () => {
    expect(escapePostgrestLikePattern("Bakau, Serrekunda")).toBe("Bakau_ Serrekunda");
    expect(escapePostgrestLikePattern("a(b)c")).toBe("a_b_c");
  });

  it("leaves plain text untouched", () => {
    expect(escapePostgrestLikePattern("ORD-42")).toBe("ORD-42");
  });
});

describe("buildDeliverySearchOr (ilike composition)", () => {
  it("returns null for empty queries (unfiltered passthrough)", () => {
    expect(buildDeliverySearchOr("")).toBeNull();
    expect(buildDeliverySearchOr("   ")).toBeNull();
    expect(buildDeliverySearchOr(null)).toBeNull();
  });

  it("composes ilike across reference + pickup + dropoff", () => {
    expect(buildDeliverySearchOr("ORD-42")).toBe(
      "order_reference.ilike.*ORD-42*,pickup_address.ilike.*ORD-42*,dropoff_address.ilike.*ORD-42*",
    );
  });

  it("trims the query before composing", () => {
    expect(buildDeliverySearchOr("  kairaba  ")).toBe(
      "order_reference.ilike.*kairaba*,pickup_address.ilike.*kairaba*,dropoff_address.ilike.*kairaba*",
    );
  });

  it("escapes LIKE wildcards inside the pattern", () => {
    expect(buildDeliverySearchOr("50% off")).toBe(
      "order_reference.ilike.*50\\% off*,pickup_address.ilike.*50\\% off*,dropoff_address.ilike.*50\\% off*",
    );
  });

  it("appends the merchant-id branch when ids are provided", () => {
    expect(buildDeliverySearchOr("shop", ["m1", "m2"])).toBe(
      "order_reference.ilike.*shop*,pickup_address.ilike.*shop*,dropoff_address.ilike.*shop*,merchant_id.in.(m1,m2)",
    );
  });

  it("omits the merchant branch for an empty id list", () => {
    expect(buildDeliverySearchOr("shop", [])).toBe(
      "order_reference.ilike.*shop*,pickup_address.ilike.*shop*,dropoff_address.ilike.*shop*",
    );
  });
});

describe("rowMatchesDeliverySearch (realtime gate)", () => {
  const row = {
    order_reference: "ORD-42",
    pickup_address: "Kairaba Avenue",
    dropoff_address: "Bakau Market",
    merchants: { name: "ShopRite" },
    merchant_name: "ShopRite",
  };

  it("passes everything on empty query", () => {
    expect(rowMatchesDeliverySearch(row, "")).toBe(true);
    expect(rowMatchesDeliverySearch(row, "   ")).toBe(true);
  });

  it("matches reference and addresses case-insensitively", () => {
    expect(rowMatchesDeliverySearch(row, "ord-42")).toBe(true);
    expect(rowMatchesDeliverySearch(row, "KAIRABA")).toBe(true);
    expect(rowMatchesDeliverySearch(row, "bakau")).toBe(true);
  });

  it("matches the joined merchant name (flat or nested)", () => {
    expect(rowMatchesDeliverySearch(row, "shoprite")).toBe(true);
    expect(rowMatchesDeliverySearch({ ...row, merchant_name: null }, "shoprite")).toBe(true);
    expect(
      rowMatchesDeliverySearch({ ...row, merchants: null, merchant_name: "ShopRite" }, "shoprite"),
    ).toBe(true);
  });

  it("rejects misses", () => {
    expect(rowMatchesDeliverySearch(row, "nope")).toBe(false);
  });

  it("supports realtime-shaped rows without the merchant join", () => {
    const realtimeRow = {
      order_reference: "ORD-1",
      pickup_address: "A",
      dropoff_address: "B",
    };
    expect(rowMatchesDeliverySearch(realtimeRow, "ord-1")).toBe(true);
    // No join on realtime payloads: merchant-only terms cannot match in place
    // (merchant-name matches arrive via the debounced server refetch).
    expect(rowMatchesDeliverySearch(realtimeRow, "shoprite")).toBe(false);
  });
});

describe("describeDeliveryResultCount (N matching vs N deliveries)", () => {
  it("labels unfiltered counts as deliveries", () => {
    expect(describeDeliveryResultCount(5, "")).toBe("5 deliveries");
    expect(describeDeliveryResultCount(0, null)).toBe("0 deliveries");
  });

  it("labels active-search counts as matching", () => {
    expect(describeDeliveryResultCount(5, "ord")).toBe("5 matching");
    expect(describeDeliveryResultCount(0, "ord")).toBe("0 matching");
  });
});

describe("fetchDeliveriesPage (server search)", () => {
  it("always selects the merchants(name) join", async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchDeliveriesPage({ status: "all", page: 1, pageSize: 20, client: asClient(client) });
    expect(calls).toContain('select("*, merchants(name)")');
  });

  it("skips the or() filter for an empty query (today's behavior exactly)", async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchDeliveriesPage({ status: "all", page: 1, pageSize: 20, search: "  ", client: asClient(client) });
    expect(calls.some((c) => c.startsWith("or("))).toBe(false);
    expect(calls).toContain("range(0,19)");
  });

  it("applies the ilike or() filter plus merchant branch when searching", async () => {
    const { client, calls } = recordingClient({ data: [], error: null });
    await fetchDeliveriesPage({
      status: "dispatched",
      page: 2,
      pageSize: 20,
      search: "ord",
      merchantIds: ["m1"],
      client: asClient(client),
    });
    expect(calls).toContain('eq("status","dispatched")');
    expect(calls).toContain(
      'or("order_reference.ilike.*ord*,pickup_address.ilike.*ord*,dropoff_address.ilike.*ord*,merchant_id.in.(m1)")',
    );
    expect(calls).toContain("range(20,39)");
  });

  it("maps the join to the flat merchant_name contract", async () => {
    const { client } = recordingClient({
      data: [
        { id: "1", merchants: { name: "ShopRite" } },
        { id: "2", merchants: null },
      ],
      error: null,
    });
    const rows = await fetchDeliveriesPage({ client: asClient(client) });
    expect(rows[0].merchant_name).toBe("ShopRite");
    expect(rows[1].merchant_name).toBeNull();
  });
});

describe("fetchMerchantIdsByName", () => {
  it("returns [] without touching the client for empty queries", async () => {
    let called = false;
    const client = {
      from: () => {
        called = true;
        throw new Error("must not be called");
      },
    };
    await expect(fetchMerchantIdsByName({ name: "  ", client: asClient(client) })).resolves.toEqual(
      [],
    );
    expect(called).toBe(false);
  });

  it("ilike-matches merchant names and returns ids", async () => {
    const { client, calls } = recordingClient({
      data: [{ id: "m1" }, { id: "m2" }],
      error: null,
    });
    await expect(fetchMerchantIdsByName({ name: "shop", client: asClient(client) })).resolves.toEqual([
      "m1",
      "m2",
    ]);
    expect(calls).toContain('from(merchants)');
    expect(calls).toContain('ilike("name","%shop%")');
  });

  it("throws on query error", async () => {
    const { client } = recordingClient({ data: null, error: { message: "boom" } });
    await expect(fetchMerchantIdsByName({ name: "shop", client: asClient(client) })).rejects.toMatchObject(
      { message: "boom" },
    );
  });
});

describe("fetchUnassignedPage (join, no search — search ignores the pool today)", () => {
  it("selects the join and maps merchant_name", async () => {
    const { client, calls } = recordingClient({
      data: [{ id: "1", merchants: { name: "ShopRite" } }],
      error: null,
    });
    const rows = await fetchUnassignedPage({ client: asClient(client) });
    expect(calls).toContain('select("*, merchants(name)")');
    expect(rows[0].merchant_name).toBe("ShopRite");
  });
});

describe("fetchDeliveriesCount (search-scoped count)", () => {
  it("applies the same or() filter when searching", async () => {
    const { client, calls } = recordingClient({ data: null, error: null, count: 3 });
    await expect(
      fetchDeliveriesCount({ search: "ord", merchantIds: [], client: asClient(client) }),
    ).resolves.toBe(3);
    expect(calls).toContain(
      'or("order_reference.ilike.*ord*,pickup_address.ilike.*ord*,dropoff_address.ilike.*ord*")',
    );
  });

  it("skips or() when unfiltered", async () => {
    const { client, calls } = recordingClient({ data: null, error: null, count: 7 });
    await expect(fetchDeliveriesCount({ client: asClient(client) })).resolves.toBe(7);
    expect(calls.some((c) => c.startsWith("or("))).toBe(false);
  });
});
