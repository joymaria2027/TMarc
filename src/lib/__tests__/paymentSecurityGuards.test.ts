import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf-8");

describe("paymentSecurityGuards migration contract", () => {
  const sql = read("../../../supabase/migrations/20260918093000_payment_security_hardening.sql");

  it("gates submit_order on a server-verified payment record", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.order_payment_verifications");
    expect(sql).toContain("verified_amount");
    expect(sql).toContain("UNIQUE (order_id, provider)");
    expect(sql).toContain("SELECT 1 FROM public.order_payment_verifications v");
    expect(sql).toContain("v.order_id = _order_id");
    expect(sql).toContain("v.amount_covers_order = true");
    expect(sql).toContain("RAISE EXCEPTION 'Payment for this order has not been confirmed'");
  });

  it("revokes submit_order from PUBLIC, anon and authenticated; grants to service_role only", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.submit_order(uuid) FROM PUBLIC;");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.submit_order(uuid) FROM anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.submit_order(uuid) TO service_role;");
  });

  it("locks order_payment_verifications against client access", () => {
    expect(sql).toContain("REVOKE ALL ON public.order_payment_verifications FROM PUBLIC;");
    expect(sql).toContain("REVOKE ALL ON public.order_payment_verifications FROM anon, authenticated;");
    expect(sql).toContain("GRANT ALL ON public.order_payment_verifications TO service_role;");
    expect(sql).toContain("ALTER TABLE public.order_payment_verifications ENABLE ROW LEVEL SECURITY;");
  });

  it("closes the default PUBLIC execute grant on credit_merchant_for_order", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.credit_merchant_for_order(uuid, text) FROM PUBLIC;");
  });

  it("fixes the submit_order call to credit_merchant_for_order with the source argument", () => {
    expect(sql).toContain("PERFORM public.credit_merchant_for_order(_order_id, 'live');");
    expect(sql).not.toContain("credit_merchant_for_order(_order_id);");
  });

  it("rejects tampered or stale price snapshots before submitting", () => {
    expect(sql).toContain("ABS(COALESCE(it.current_price, it.price_snapshot) - it.price_snapshot) > 0.009");
    expect(sql).toContain("ABS(it.line_total - (it.price_snapshot * it.quantity)) > 0.009");
    expect(sql).toContain("RAISE EXCEPTION 'Order price data is stale or tampered'");
  });

  it("splits orders_customer_rw so customers can insert and select but never update", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "orders_customer_rw" ON public.orders;');
    expect(sql).toContain('CREATE POLICY "orders_customer_insert" ON public.orders');
    expect(sql).toContain('CREATE POLICY "orders_customer_select" ON public.orders');
  });
});

describe("modempay-create-checkout contract", () => {
  const src = read("../../../supabase/functions/modempay-create-checkout/index.ts");

  it("fails closed when MODEMPAY_API_KEY is missing (no stub payments)", () => {
    expect(src).toContain('return json({ error: "payment unavailable" }, 500);');
    expect(src).not.toContain("modempay-stub");
    expect(src).not.toContain("stub: true");
  });
});

describe("modempay webhook contract", () => {
  const shared = read("../../../supabase/functions/_shared/modempay.ts");

  it("records a server-side payment verification before submitting successful orders", () => {
    expect(shared).toContain("order_payment_verifications");
    expect(shared).toContain("amount_covers_order");
  });

  it("rejects invalid signatures without any API-verification fallback", () => {
    expect(shared).not.toContain("verifyWithModemPayApi");
    expect(shared).toContain('await setStatus("invalid_signature", "HMAC signature mismatch");');
  });

  it("does not log signature material on mismatch", () => {
    expect(shared).not.toContain("modempay sig mismatch");
    expect(shared).not.toContain("secret_len");
    expect(shared).not.toContain("expected_sha512_first12");
  });
});

describe("webhook debug function removal", () => {
  it("deletes the HMAC oracle endpoint from the repo", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../../../supabase/functions/modempay-webhook-debug"))).toBe(false);
  });
});
