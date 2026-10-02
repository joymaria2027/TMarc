import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CHANGE-DETECTOR, NOT AN EXECUTED CONTRACT.
 *
 * There is no database in CI, so this asserts on the migration's source text
 * (same convention as `paymentSecurityGuards.test.ts`). These tests prove the
 * SQL is still *written down*, not that Postgres enforces it. The behavioural
 * scenarios in plan 005 step 7 require a real database.
 *
 * The ordering assertions are the ones that matter: the insert-vs-update swap
 * is a two-line move that is easy to miss in review and catastrophic to omit.
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const read = (p: string) => fs.readFileSync(p, "utf-8");

const moneyFile = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith("_money_ledger_integrity.sql"))
  .sort()
  .pop();

/** Slice one function's body out of the migration so positions are per-function. */
function bodyOf(sql: string, fnName: string): string {
  const start = sql.indexOf(`FUNCTION public.${fnName}(`);
  expect(start, `${fnName} not found in migration`).toBeGreaterThan(-1);
  const end = sql.slice(start).indexOf("\n$$;");
  return sql.slice(start, start + end);
}

/**
 * Executable SQL only. This migration's header explains at length why a
 * tempting guard was deliberately NOT written; negative assertions must not be
 * satisfied (or defeated) by that prose, only by real DDL.
 */
function stripComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}

describe("money_ledger_integrity migration contract", () => {
  it("finds the migration", () => {
    expect(moneyFile).toBeDefined();
  });

  const sql = moneyFile ? read(path.join(migrationsDir, moneyFile)) : "";

  // --- fix 1: ordering -------------------------------------------------------

  it("inserts the ledger row before the balance debit in process_withdrawal_completion", () => {
    const body = bodyOf(sql, "process_withdrawal_completion");
    const insert = body.indexOf("INSERT INTO wallet_transactions");
    const debit = body.indexOf("UPDATE wallets SET balance = balance -");
    expect(insert).toBeGreaterThan(-1);
    expect(debit).toBeGreaterThan(-1);
    // Reversed, guard_wallet_debit (BEFORE INSERT) would read the
    // already-decremented balance and reject every withdrawal over half of it.
    expect(insert).toBeLessThan(debit);
  });

  it("inserts the ledger row before the payer debit in run_payroll", () => {
    const body = bodyOf(sql, "run_payroll");
    const insert = body.indexOf("INSERT INTO wallet_transactions");
    const debit = body.indexOf("UPDATE wallets SET balance = balance -");
    expect(insert).toBeGreaterThan(-1);
    expect(debit).toBeGreaterThan(-1);
    expect(insert).toBeLessThan(debit);
  });

  // --- fix 2: withdrawal amount ----------------------------------------------

  it("constrains withdrawal_requests.amount to be positive", () => {
    expect(sql).toContain("ADD CONSTRAINT withdrawal_requests_amount_positive");
    expect(sql).toMatch(/withdrawal_requests_amount_positive\s+CHECK\s*\(amount > 0\)/);
  });

  // --- fix 3: wallets.balance — deliberately NOT shipped ----------------------

  it("does not ship the unproven wallets.balance ledger predicate", () => {
    // Plan 005 step 4 was STOPPED. Its proposed predicate was
    // `wt.created_at >= OLD.updated_at`, evaluated in a BEFORE UPDATE trigger —
    // but every credit path inserts its wallet_transactions row *after* the
    // balance update (credit_wallets_on_settlement: UPDATE then INSERT; same in
    // run_payroll). At trigger time that row does not exist, so the predicate
    // false-positives on legitimate settlement credits (halting the core
    // business flow) or false-negatives (leaving the hole open).
    //
    // This assertion exists so the broken form cannot be reintroduced quietly.
    // `wallets.balance` is still directly writable by an accountant/admin
    // session; that hole is OPEN and tracked, not fixed.
    const ddl = stripComments(sql);
    expect(ddl).not.toContain("guard_wallet_balance_ledger");
    expect(ddl).not.toContain("created_at >= OLD.updated_at");
    expect(ddl).not.toMatch(/BEFORE UPDATE OF balance/i);
  });

  // --- fix 4: orders.total ---------------------------------------------------

  it("validates orders.total against subtotal + delivery_fee", () => {
    expect(sql).toContain("RAISE EXCEPTION 'Order total does not match subtotal plus delivery fee'");
    expect(sql).toMatch(
      /COALESCE\(o\.total, 0\)\s*-\s*\(COALESCE\(o\.subtotal, 0\) \+ COALESCE\(o\.delivery_fee, 0\)\)/,
    );
  });

  it("keeps the original subtotal guard alongside the new total guard", () => {
    const body = bodyOf(sql, "submit_order");
    expect(body).toContain("ABS(COALESCE(o.subtotal, 0) - (");
    expect(body).toContain("FROM order_items WHERE order_id = _order_id");
    // The old comment claimed to catch a rewritten order.total; it never did.
    // It must not be restated as if it still does.
    expect(body).not.toMatch(/catches a rewritten order\.total/i);
  });

  // --- preserved security clauses --------------------------------------------

  it("keeps SECURITY DEFINER paired with SET search_path on every definer", () => {
    const definers = (sql.match(/SECURITY DEFINER/g) ?? []).length;
    const searchPaths = (sql.match(/SET search_path/g) ?? []).length;
    expect(definers).toBeGreaterThan(0);
    // Dropping search_path on a definer function is a security regression;
    // dropping SECURITY DEFINER breaks writes the caller cannot perform.
    expect(searchPaths).toBe(definers);
  });
});
