import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Anti-abuse slice 3a: the fraud audit report gains check 16,
 * delivered_no_proof — delivered rows with no pickup record and no receipt
 * (the Mark Completed abuse shape), so reviewers can audit past and future
 * occurrences, including ones approved before the proof trigger existed.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000003_delivered_no_proof_fraud_check.sql",
);

describe("fraud audit delivered_no_proof check", () => {
  it("adds the delivered_no_proof check as a warning", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("'delivered_no_proof'");
    expect(sql).toContain("'warning'");
    expect(sql).toContain("picked_up_at IS NULL");
    expect(sql).toContain("receipt_attached IS NOT TRUE");
  });

  it("keeps the pre-existing checks intact (verbatim derivation)", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    for (const key of [
      "'ledger_drift'",
      "'negative_balance'",
      "'no_distance'",
      "'legacy_autofuel'",
    ]) {
      expect(sql).toContain(key);
    }
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fraud_audit_report()");
  });
});
