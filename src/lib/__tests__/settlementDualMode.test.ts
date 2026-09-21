import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: .scratch/settlements-dual-mode/01 — manual + automated settlements coexist.
 *
 * No live database in CI, so like `deliveryHandoverCode.test.ts` these tests
 * pin the security-critical SHAPE of the migration: per-merchant mode with a
 * manual default (current behavior preserved), an auditable source column,
 * an instant auto-approve trigger gated on the handover-code-verified
 * delivered transition, rider-expense back-out blocking (fuel etc. must be
 * verified first), throttled settlement_blocked nag alerts, a retry trigger
 * for late expense verification, and an hourly self-healing reminder.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000005_settlement_dual_mode.sql",
);
const sql = fs.readFileSync(MIGRATION, "utf-8");

describe("settlement mode + source columns", () => {
  it("adds a per-merchant settlement_mode defaulting to manual", () => {
    expect(sql).toMatch(/ALTER TABLE public\.merchants[\s\S]*?ADD COLUMN IF NOT EXISTS settlement_mode/);
    expect(sql).toMatch(/DEFAULT 'manual'/);
    expect(sql).toMatch(/settlement_mode IN \('manual', ?'auto'\)/);
  });

  it("adds an auditable deliveries.settlement_source defaulting to manual", () => {
    expect(sql).toMatch(/ALTER TABLE public\.deliveries[\s\S]*?ADD COLUMN IF NOT EXISTS settlement_source/);
    expect(sql).toMatch(/settlement_source IN \('manual', ?'auto'\)/);
  });
});

describe("auto_settle_delivery trigger", () => {
  it("fires AFTER UPDATE on deliveries so the handover-code gate runs first", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.auto_settle_delivery/);
    expect(sql).toMatch(/AFTER UPDATE ON public\.deliveries/);
    expect(sql).toMatch(/CREATE TRIGGER trg_auto_settle_delivery/);
  });

  it("only acts on the transition into delivered while still unapproved", () => {
    // Recursion guard: the trigger's own approving UPDATE must exit early.
    expect(sql).toMatch(/NEW\.status IS DISTINCT FROM 'delivered'.*RETURN NEW/s);
    expect(sql).toMatch(/OLD\.status IS NOT DISTINCT FROM 'delivered'.*RETURN NEW/s);
    expect(sql).toMatch(/NEW\.settlement_approved = true.*RETURN NEW/s);
  });

  it("only auto-settles merchants opted into auto mode", () => {
    expect(sql).toMatch(/settlement_mode INTO v_mode FROM public\.merchants/);
    expect(sql).toMatch(/v_mode IS DISTINCT FROM 'auto'.*RETURN NEW/s);
  });

  it("requires a sharing ratio summing to 100 at fire time", () => {
    expect(sql).toMatch(/FROM public\.revenue_sharing s WHERE s\.merchant_id = NEW\.merchant_id/);
    expect(sql).toMatch(/ROUND\(v_share_total, 2\) <> 100.*RETURN NEW/s);
  });

  it("blocks on pending rider OR merchant expenses (fuel back-out rule)", () => {
    // Mirrors the SettlementsPage netting: that rider's expenses and that
    // merchant's expenses, anything not approved/verified, block automation.
    expect(sql).toMatch(/FROM public\.rider_expenses/);
    expect(sql).toMatch(/status NOT IN \('approved', ?'verified'\)/);
    expect(sql).toMatch(/e\.rider_id = NEW\.rider_id/);
    expect(sql).toMatch(/e\.merchant_id = NEW\.merchant_id/);
  });

  it("auto-approves with source auto and leaves wallet crediting to the existing trigger", () => {
    expect(sql).toMatch(/SET settlement_approved = true/);
    expect(sql).toMatch(/settlement_source = 'auto'/);
    expect(sql).toMatch(/settlement_approved_by = NULL/);
  });
});

describe("settlement_blocked nag alerts", () => {
  it("raises an immediate alert to the expense verifier when blocked", () => {
    expect(sql).toMatch(/INSERT INTO public\.expense_alerts/);
    expect(sql).toMatch(/'settlement_blocked'/);
    expect(sql).toMatch(/'company_manager'/);
  });

  it("throttles reminders to one per expense per hour", () => {
    expect(sql).toMatch(/interval '1 hour'/);
    expect(sql).toMatch(/alert_type = 'settlement_blocked'/);
  });

  it("nags at most one reminder per delivery per hour (oldest blocker)", () => {
    expect(sql).toMatch(/DISTINCT ON \(del\.id\)/);
  });
});

describe("late expense verification retry", () => {
  it("retries auto-settlement when a blocking expense is verified later", () => {
    // The delivered transition already happened, so a second trigger on
    // rider_expenses must pick up the now-unblocked delivery.
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.retry_auto_settlement/);
    expect(sql).toMatch(/AFTER UPDATE ON public\.rider_expenses/);
    expect(sql).toMatch(/settlement_source = 'auto'/);
  });
});

describe("hourly self-healing reminder", () => {
  it("exposes a remind function that re-alerts and late-approves", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.remind_blocked_settlements/);
    expect(sql).toMatch(/RETURNS integer/);
  });

  it("documents pg_cron scheduling without requiring the extension", () => {
    expect(sql).toMatch(/cron\.schedule\('hourly-settlement-reminders'/);
  });
});
