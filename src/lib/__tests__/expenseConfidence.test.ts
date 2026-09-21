import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: .scratch/settlements-dual-mode/02 — expense confidence score.
 *
 * No live database in CI: pins the SHAPE of the migration. Policy locked
 * 2026-09-21: auto-verify iff score >= 85 AND amount <= D100 AND rider's
 * auto-verified total today <= D300; score < 60 forces a human reason.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260921000003_expense_confidence.sql",
);
const sql = fs.readFileSync(MIGRATION, "utf-8");

describe("confidence columns", () => {
  it("adds score, reasons, auto flag and review note to rider_expenses", () => {
    expect(sql).toMatch(/ALTER TABLE public\.rider_expenses[\s\S]*?ADD COLUMN IF NOT EXISTS confidence_score/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS confidence_reasons/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS auto_verified/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS review_note/);
  });
});

describe("score_rider_expense signals", () => {
  it("rewards an attached receipt", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.score_rider_expense/);
    expect(sql).toMatch(/receipt_url IS NOT NULL/);
  });

  it("rewards amounts near the rider's history norm, neutral without history", () => {
    expect(sql).toMatch(/expense_type_id/);
    expect(sql).toMatch(/0\.5/);
  });

  it("penalizes near-duplicates in the last 7 days", () => {
    expect(sql).toMatch(/interval '7 days'/);
  });

  it("rewards a real description and clamps the score to 0-100", () => {
    expect(sql).toMatch(/GREATEST\(0, LEAST\(100/);
  });
});

describe("auto-verify trigger", () => {
  it("scores on BEFORE INSERT so no recursion is possible", () => {
    expect(sql).toMatch(/BEFORE INSERT ON public\.rider_expenses/);
  });

  it("enforces the triple gate: score >= 85, amount <= D100, D300 daily cap", () => {
    expect(sql).toMatch(/v_score >= 85/);
    expect(sql).toMatch(/<= 100/);
    expect(sql).toMatch(/<= 300/);
  });

  it("only touches pending submissions, never rewrites human decisions", () => {
    expect(sql).toMatch(/NEW\.status IS DISTINCT FROM 'pending'.*RETURN NEW/s);
  });

  it("stamps system verifications auditably and notifies the rider", () => {
    expect(sql).toMatch(/auto_verified := true/);
    expect(sql).toMatch(/verified_by := NULL/);
    expect(sql).toMatch(/'expense_verified'/);
  });
});
