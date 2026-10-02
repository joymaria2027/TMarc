import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CHANGE-DETECTOR, NOT AN EXECUTED CONTRACT.
 *
 * No database in CI, so this asserts on the migration's source text (same
 * convention as `paymentSecurityGuards.test.ts`). It proves the guard is still
 * *written down*, not that Postgres enforces it. The role scenarios need a real
 * database.
 *
 * This closes plan 005 step 4, which was originally stopped because a
 * ledger-presence predicate cannot work in a BEFORE trigger. See the migration
 * header for why `current_user` does work.
 */

const migrationsDir = path.resolve(__dirname, "../../../supabase/migrations");
const read = (p: string) => fs.readFileSync(p, "utf-8");

const guardFile = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith("_guard_wallet_balance_writes.sql"))
  .sort()
  .pop();

describe("guard_wallet_balance_writes migration contract", () => {
  it("finds the migration", () => {
    expect(guardFile).toBeDefined();
  });

  const sql = guardFile ? read(path.join(migrationsDir, guardFile)) : "";
  /** Executable SQL only, so the header's prose cannot satisfy or defeat a negative assertion. */
  const ddl = sql.replace(/^\s*--.*$/gm, "");
  const fnStart = ddl.indexOf("FUNCTION public.guard_wallet_balance_writes(");
  const body = fnStart > -1 ? ddl.slice(fnStart, ddl.indexOf("\n$$;", fnStart)) : "";

  it("guards both INSERT and UPDATE of balance", () => {
    expect(sql).toContain("CREATE TRIGGER trg_guard_wallet_balance_writes");
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF balance ON public\.wallets/);
  });

  // The whole design rests on this: it is a DENY list of the two roles PostgREST
  // uses for end-user requests. An allow list (`current_user IN ('postgres', …)`)
  // would fail CLOSED and could halt a future legitimate writer.
  it("denies only the PostgREST session roles, failing open for everything else", () => {
    expect(body).toContain("current_user IN ('anon', 'authenticated')");
    expect(body).not.toMatch(/current_user\s+IN\s*\(\s*'postgres'/);
    expect(body).not.toMatch(/current_user\s+NOT IN/);
  });

  it("blocks a balance change and a fabricated starting balance", () => {
    expect(body).toContain("TG_OP = 'INSERT'");
    expect(body).toMatch(/NEW\.balance IS DISTINCT FROM OLD\.balance/);
    expect(body).toContain("Wallet balance cannot be changed directly");
    expect(body).toContain("Wallet balance cannot be created directly");
    expect((body.match(/ERRCODE = '42501'/g) ?? []).length).toBe(2);
  });

  it("allows a zero-balance insert and non-balance updates through", () => {
    // run_payroll creates payee wallets at balance 0; the guard must not block
    // writes to unrelated columns (e.g. the updated_at trigger).
    expect(body).toMatch(/COALESCE\(NEW\.balance, 0\) <> 0/);
  });

  // --- regression guards -----------------------------------------------------

  it("does NOT reintroduce the unprovable ledger-presence predicate", () => {
    // This is what plan 005 step 4 originally proposed and why it was stopped:
    // every credit path inserts its wallet_transactions row AFTER the balance
    // update, so a BEFORE trigger cannot see the row.
    expect(ddl).not.toContain("wallet_transactions");
    expect(ddl).not.toContain("created_at >= OLD.updated_at");
  });

  it("does not blanket-revoke or drop the existing wallet policies", () => {
    // Revoking outright would break any legitimate admin correction path, and
    // dropping the policies is not needed: the trigger is the control.
    expect(ddl).not.toMatch(/^\s*REVOKE\b/im);
    expect(ddl).not.toMatch(/DROP POLICY/i);
  });

  it("keeps SET search_path, and stays deliberately NOT SECURITY DEFINER", () => {
    expect(body).toContain("SET search_path TO 'public'");
    // SECURITY DEFINER here would be a subtle, self-defeating bug: inside a
    // definer function `current_user` is the OWNER, so every session write would
    // be waved through and the guard would become a no-op. Asserted explicitly
    // because it reads like an omission.
    expect(body).not.toContain("SECURITY DEFINER");
    const definers = (ddl.match(/SECURITY DEFINER/g) ?? []).length;
    const searchPaths = (ddl.match(/SET search_path/g) ?? []).length;
    expect(searchPaths).toBe(definers + 1); // the one function, which is not a definer
  });
});