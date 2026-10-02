import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CHANGE-DETECTOR, NOT AN EXECUTED CONTRACT.
 *
 * This repo has no database in CI, so the established convention for
 * SQL-boundary guards is a text-grep test over the migration source (see
 * `paymentSecurityGuards.test.ts` and `modempayWebhookDedup.test.ts`). That
 * makes these assertions a detector for *changes to the SQL text* — they prove
 * the guard is still written down, not that Postgres enforces it. The five
 * role scenarios in plan 004 step 4 still require a real database.
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const read = (p: string) => fs.readFileSync(p, "utf-8");

/** Plan 004's migration is generated at execution time, so glob rather than hardcode. */
const guardFile = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith("_guard_delivery_settlement_columns.sql"))
  .sort()
  .pop();

describe("guard_delivery_settlement_columns migration contract", () => {
  it("finds the migration", () => {
    expect(guardFile).toBeDefined();
  });

  const sql = guardFile ? read(path.join(migrationsDir, guardFile)) : "";
  const riderPolicyFile = "20260412122346_0fe944b7-b9e4-4034-a068-f42023e0122c.sql";
  const riderPolicy = read(path.join(migrationsDir, riderPolicyFile));

  it("guards all five privileged columns with a BEFORE UPDATE OF trigger", () => {
    expect(sql).toContain("BEFORE UPDATE OF settlement_approved, settlement_approved_by,");
    expect(sql).toContain("settlement_source, actual_tariff, estimated_tariff");
    expect(sql).toContain("CREATE TRIGGER trg_guard_delivery_settlement_columns");
    expect(sql).toContain("ON public.deliveries");
    expect(sql.match(/CREATE TRIGGER/g)).toHaveLength(1);
  });

  it("rejects a non-privileged writer with insufficient_privilege", () => {
    expect(sql).toContain(
      "Only settlement-privileged roles may modify settlement or tariff columns",
    );
    expect(sql).toContain("ERRCODE = '42501'");
  });

  it("allowlists exactly the roles the client gate at SettlementsPage canApprove uses", () => {
    // client gate: hasRole('accountant') || hasRole('company_manager') || hasRole('admin')
    expect(sql).toContain("public.has_role(auth.uid(), 'admin')");
    expect(sql).toContain("public.has_role(auth.uid(), 'accountant')");
    expect(sql).toContain("public.has_role(auth.uid(), 'company_manager')");
    // The SECURITY DEFINER escape hatch that keeps auto_settle_delivery working.
    expect(sql).toContain("current_user NOT IN ('postgres', 'supabase_admin', 'service_role')");
  });

  // --- regression guards -----------------------------------------------------

  it("does NOT blanket-revoke UPDATE on deliveries", () => {
    // A `REVOKE UPDATE (settlement_approved, ...) FROM authenticated` appears to
    // be the tighter fix and is wrong: settlement approval is a direct
    // client-side .update() from a staff session, so this would take the core
    // approval feature down for every staff member.
    expect(sql).not.toMatch(/^\s*REVOKE\b/im);
    expect(sql).not.toMatch(/REVOKE[\s\S]*ON\s+(public\.)?deliveries/i);
  });

  it("leaves the existing Rider UPDATE policy untouched", () => {
    // Removing it would break the Rider flow (status transitions, odometer
    // photos, receipts). It is correct for the columns Riders *should* write.
    expect(riderPolicy).toContain('CREATE POLICY "Riders can update own deliveries"');
    expect(riderPolicy).toContain("ON public.deliveries FOR UPDATE");
    expect(sql).not.toContain("DROP POLICY");
  });
});
