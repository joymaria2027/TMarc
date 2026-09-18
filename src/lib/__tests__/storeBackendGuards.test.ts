import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("storeBackendGuards Migration Contract", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../supabase/migrations/20260918073500_8f6e1a2b-3c4d-4e5f-9a0b-1c2d3e4f5a6b.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("defines public.merchant_is_public helper with SECURITY DEFINER and safe search_path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.merchant_is_public(_merchant_id uuid)");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("approval_status = 'approved'");
    expect(sql).toContain("is_active = true");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.merchant_is_public(uuid) FROM PUBLIC;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.merchant_is_public(uuid) TO anon, authenticated;");
  });

  it("drops legacy open read policy and scopes merchants table RLS", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated users can view restaurants" ON public.merchants;');
    expect(sql).toContain("GRANT SELECT ON public.merchants TO anon;");

    // Staff read-all
    expect(sql).toContain('CREATE POLICY "merchants_staff_read_all" ON public.merchants');
    expect(sql).toContain("'admin'::app_role");
    expect(sql).toContain("'accountant'::app_role");
    expect(sql).toContain("'business_owner'::app_role");
    expect(sql).toContain("'company_manager'::app_role");
    expect(sql).toContain("'app_developer'::app_role");
    expect(sql).toContain("'rider'::app_role");

    // Own manager / accountant read
    expect(sql).toContain('CREATE POLICY "merchants_manager_accountant_read_own" ON public.merchants');
    expect(sql).toContain("manager_user_id = auth.uid()");
    expect(sql).toContain("accountant_user_id = auth.uid()");

    // Public read
    expect(sql).toContain('CREATE POLICY "merchants_public_read_approved" ON public.merchants');
    expect(sql).toContain("FOR SELECT TO anon, authenticated");
    expect(sql).toContain("approval_status = 'approved'");
    expect(sql).toContain("is_active = true");
  });

  it("tightens products and categories public read to require approved and active owning merchant", () => {
    // Products
    expect(sql).toContain('DROP POLICY IF EXISTS "products_public_read_approved" ON public.products;');
    expect(sql).toContain('CREATE POLICY "products_public_read_approved" ON public.products');
    expect(sql).toContain("public.merchant_is_public(merchant_id)");

    // Categories
    expect(sql).toContain('DROP POLICY IF EXISTS "categories_public_read" ON public.product_categories;');
    expect(sql).toContain('CREATE POLICY "categories_public_read" ON public.product_categories');
    expect(sql).toContain("public.merchant_is_public(merchant_id)");
    expect(sql).toContain('CREATE POLICY "categories_parent_manager_read" ON public.product_categories');
  });

  it("tightens wholesale pricing and settings public read to require approved and active merchant", () => {
    expect(sql).toContain('CREATE POLICY "Approved wholesalers view wholesale prices" ON public.product_wholesale_pricing');
    expect(sql).toContain("public.is_approved_wholesaler(auth.uid()) AND public.merchant_is_public(merchant_id)");

    expect(sql).toContain('CREATE POLICY "Approved wholesalers view store wholesale settings" ON public.merchant_wholesale_settings');
    expect(sql).toContain("public.is_approved_wholesaler(auth.uid()) AND public.merchant_is_public(merchant_id)");
  });

  it("adds approval and active validation in submit_order", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.submit_order(_order_id uuid)");
    expect(sql).toContain("mrow.approval_status <> 'approved' OR mrow.is_active = false");
    expect(sql).toContain("RAISE EXCEPTION 'Merchant is not approved or inactive'");
  });

  it("adds BEFORE INSERT trigger on orders to block drafting against unapproved/inactive merchants", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.check_order_merchant_is_public()");
    expect(sql).toContain("IF NOT public.merchant_is_public(NEW.merchant_id) THEN");
    expect(sql).toContain("RAISE EXCEPTION 'Cannot place order with unapproved or inactive merchant'");
    expect(sql).toContain("CREATE TRIGGER trg_check_order_merchant");
    expect(sql).toContain("BEFORE INSERT ON public.orders");
    expect(sql).toContain("EXECUTE FUNCTION public.check_order_merchant_is_public();");
  });
});

describe("StoreLandingPage state resolution logic", () => {
  // Simulates StoreLandingPage's internal decision matrix
  function resolveStoreLandingState(m: { id: string; name: string; is_active: boolean; approval_status: string } | null) {
    if (!m) {
      return { ok: false, reason: "We could not find this store." };
    }
    if (m.approval_status !== "approved") {
      return { ok: false, name: m.name, reason: "This store is still being reviewed and is not open yet." };
    }
    if (!m.is_active) {
      return { ok: false, name: m.name, reason: "This store is currently closed." };
    }
    return { ok: true, name: m.name };
  }

  it("returns 'not found' when store row is null (e.g. filtered out by RLS for public customer)", () => {
    const result = resolveStoreLandingState(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("We could not find this store.");
  });

  it("returns 'still being reviewed' when store is pending", () => {
    const result = resolveStoreLandingState({
      id: "mid-1",
      name: "Banjul Bakery Branch 2",
      is_active: true,
      approval_status: "pending",
    });
    expect(result.ok).toBe(false);
    expect(result.name).toBe("Banjul Bakery Branch 2");
    expect(result.reason).toBe("This store is still being reviewed and is not open yet.");
  });

  it("returns 'still being reviewed' when store is rejected", () => {
    const result = resolveStoreLandingState({
      id: "mid-2",
      name: "Bad Branch",
      is_active: true,
      approval_status: "rejected",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This store is still being reviewed and is not open yet.");
  });

  it("returns 'currently closed' when store is approved but inactive", () => {
    const result = resolveStoreLandingState({
      id: "mid-3",
      name: "Kairaba Supermarket",
      is_active: false,
      approval_status: "approved",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("This store is currently closed.");
  });

  it("returns ok=true when store is approved and active", () => {
    const result = resolveStoreLandingState({
      id: "mid-4",
      name: "Kairaba Supermarket",
      is_active: true,
      approval_status: "approved",
    });
    expect(result.ok).toBe(true);
    expect(result.name).toBe("Kairaba Supermarket");
  });
});
