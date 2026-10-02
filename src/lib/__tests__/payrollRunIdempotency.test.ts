import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CHANGE-DETECTOR, NOT AN EXECUTED CONTRACT.
 *
 * No database in CI, so this asserts on the migration's source text (same
 * convention as `paymentSecurityGuards.test.ts`). It proves the SQL is written
 * down, not that Postgres enforces it. Plan 006's behavioural scenarios still
 * need a real database.
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const read = (p: string) => fs.readFileSync(p, "utf-8");

const payrollFile = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith("_payroll_run_idempotency.sql"))
  .sort()
  .pop();

function bodyOf(sql: string, fnName: string): string {
  const start = sql.indexOf(`FUNCTION public.${fnName}(`);
  expect(start, `${fnName} not found in migration`).toBeGreaterThan(-1);
  const end = sql.slice(start).indexOf("\n$$;");
  return sql.slice(start, start + end);
}

describe("payroll_run_idempotency migration contract", () => {
  it("finds the migration", () => {
    expect(payrollFile).toBeDefined();
  });

  const sql = payrollFile ? read(path.join(migrationsDir, payrollFile)) : "";
  const body = bodyOf(sql, "run_payroll");

  it("constrains payroll_runs to one run per assignment and period", () => {
    expect(sql).toContain("ADD CONSTRAINT payroll_runs_assignment_period_uniq");
    expect(sql).toMatch(
      /payroll_runs_assignment_period_uniq\s+UNIQUE\s*\(assignment_id, period_start, period_end\)/,
    );
  });

  it("checks for an existing run before touching any wallet", () => {
    const guard = body.indexOf("IF EXISTS (SELECT 1 FROM payroll_runs");
    const firstDebit = body.indexOf("UPDATE wallets SET balance = balance -");
    const firstCredit = body.indexOf("UPDATE wallets SET balance = balance +");
    expect(guard).toBeGreaterThan(-1);
    expect(firstDebit).toBeGreaterThan(-1);
    // The ordering that matters: bail out before any money moves.
    expect(guard).toBeLessThan(firstDebit);
    expect(guard).toBeLessThan(firstCredit);
  });

  it("raises unique_violation so the client can distinguish a repeat run", () => {
    expect(body).toContain("Payroll already run for this assignment and period");
    expect(body).toContain("ERRCODE = '23505'");
  });

  it("preserves SECURITY DEFINER and search_path on the redefined function", () => {
    const definers = (sql.match(/SECURITY DEFINER/g) ?? []).length;
    const searchPaths = (sql.match(/SET search_path/g) ?? []).length;
    expect(definers).toBe(1);
    expect(searchPaths).toBe(definers);
  });

  // --- regression guards -----------------------------------------------------

  it("does not revert plan 005's debit-ordering fix", () => {
    // run_payroll is redefined here, so if this body was copied from the original
    // 20260520120446 migration rather than from 005's output, 005's ordering fix
    // (ledger INSERT before the balance UPDATE) would be silently undone and
    // guard_wallet_debit would again reject any payroll over half the balance.
    const insert = body.indexOf("INSERT INTO wallet_transactions");
    const debit = body.indexOf("UPDATE wallets SET balance = balance -");
    expect(insert).toBeGreaterThan(-1);
    expect(insert).toBeLessThan(debit);
  });

  it("still guards the admin role check", () => {
    expect(body).toContain("Only admin can run payroll");
  });
});
