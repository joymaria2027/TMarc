import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: handover-code/01 — customer-verifies delivery completion.
 *
 * The rider must not be able to complete a delivery (either completion path)
 * without the customer's handover code being verified server-side. There is no
 * live database in CI, so like `deliveryCompletionProof.test.ts` these tests
 * pin the security-critical SHAPE of the migration: isolated RLS-denied
 * storage, server-side generation, the verify RPC contract (rider-owned,
 * attempt lockout, code never returned), the customer/staff reveal RPC, and
 * the hardened completion gate with one-shot expiry.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000004_delivery_handover_code.sql",
);
const sql = fs.readFileSync(MIGRATION, "utf-8");

describe("handover code storage", () => {
  it("keeps the code in an isolated table with RLS enabled and NO policies", () => {
    // Riders do select('*') on deliveries today — a code column there would
    // ship the code to the rider (defeats the whole feature).
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.delivery_handover_codes");
    expect(sql).toMatch(/delivery_handover_codes[\s\S]*?CHECK \(handover_code BETWEEN 100000 AND 999999\)/);
    expect(sql).toMatch(/ALTER TABLE public\.delivery_handover_codes ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*delivery_handover_codes/);
  });

  it("cascades the code row with its delivery and tracks brute-force state", () => {
    expect(sql).toMatch(/REFERENCES public\.deliveries\(id\) ON DELETE CASCADE/);
    expect(sql).toContain("handover_code_verified_at");
    expect(sql).toContain("handover_code_attempts");
    expect(sql).toContain("handover_code_last_attempt_at");
  });

  it("generates the code server-side on delivery INSERT, never in the browser", () => {
    expect(sql).toMatch(/AFTER INSERT ON public\.deliveries/);
    expect(sql).toMatch(/100000 \+ floor\(random\(\) \* 900000\)::int/);
    expect(sql).toMatch(/ON CONFLICT \(delivery_id\) DO NOTHING/);
  });
});

describe("verify_delivery_handover_code", () => {
  it("is a SECURITY DEFINER RPC bound to the assigned rider", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.verify_delivery_handover_code/);
    expect(sql).toContain("SECURITY DEFINER");
    // Only the assigned rider may verify — no arbitrary delivery ids.
    expect(sql).toMatch(/rider_id IS NOT DISTINCT FROM v_rider_id/);
  });

  it("locks verification after 5 failed attempts within 10 minutes", () => {
    expect(sql).toMatch(/v_attempts >= 5/);
    expect(sql).toMatch(/interval '10 minutes'/);
  });

  it("uses a sliding window: the counter resets only once the window has passed", () => {
    // A stale counter that never resets would brick the delivery forever.
    expect(sql).toMatch(/v_last_attempt <= now\(\) - interval '10 minutes'/);
    expect(sql).toMatch(/v_attempts := 0/);
  });

  it("exposes a per-caller computed column so MyOrders can embed the code", () => {
    // PostgREST shim: deliveries.handover_code resolves for the owning
    // customer only — riders get NULL by construction.
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.handover_code\(d public\.deliveries\)/);
    expect(sql).toMatch(/RETURNS integer/);
    expect(sql).toMatch(/cu\.user_id = auth\.uid\(\)/);
  });

  it("returns a boolean and never the code", () => {
    expect(sql).toMatch(/RETURNS boolean/);
    // Verification marks the row, it does not echo the code back.
    expect(sql).toMatch(/handover_code_verified_at = now\(\)/);
  });
});

describe("customer + staff code reveal", () => {
  it("exposes the code only to the owning customer or ops roles", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_my_handover_code/);
    // Customer linkage: deliveries <- orders <- customers.user_id = auth.uid()
    expect(sql).toMatch(/cu\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'admin'::app_role\)/);
    // Merchant managers create manual deliveries — they relay the code too.
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'merchant_manager'::app_role\)/);
  });

  it("is corrected by 20260920000006: selects c.handover_code, never c.code", () => {
    // Regression: 04 shipped `SELECT c.code` (wrong column); Postgres only
    // resolves plpgsql column refs at first execution, so the bug survived
    // CREATE and surfaced as SQLSTATE 42703 on the first live call.
    const fix = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../supabase/migrations/20260920000006_fix_handover_code_reveal.sql",
      ),
      "utf-8",
    );
    expect(fix).toMatch(/SELECT c\.handover_code INTO/);
    expect(fix).not.toMatch(/SELECT c\.code INTO/);
  });

  it("uses the real app_role enum value company_manager, not merchant_manager", () => {
    // SQLSTATE 22P02: 'merchant_manager' is not a value of app_role; the
    // merchant-facing manager role in this database is company_manager.
    const fix = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../supabase/migrations/20260920000006_fix_handover_code_reveal.sql",
      ),
      "utf-8",
    );
    expect(fix).toContain("'company_manager'::app_role");
    expect(fix).not.toContain("'merchant_manager'::app_role");
  });
});

describe("completion gate hardening", () => {
  it("requires a verified handover code for every non-admin delivered transition", () => {
    expect(sql).toMatch(/handover_code_verified_at IS NOT NULL/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Delivery cannot be completed without the customer handover code/);
    // Ops bypass is preserved for legitimate corrections.
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'app_developer'::app_role\)/);
  });

  it("expires the code on completion so one confirmation can never be replayed", () => {
    // The proof trigger deletes the code row as it allows the transition.
    expect(sql).toMatch(/DELETE FROM public\.delivery_handover_codes WHERE delivery_id = NEW\.id/);
  });
});
