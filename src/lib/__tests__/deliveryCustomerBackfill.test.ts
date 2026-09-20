import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: rider Accept fails on legacy deliveries with
 * `violates check constraint "deliveries_customer_name_not_blank"`.
 * Those rows were created with customer_name = '' (before the rule), which
 * freezes them: Postgres validates every CHECK on any UPDATE.
 *
 * Repair (merchant-supplied truth): the 4 live queue rows belong to
 * Joy · 7820582; the delivered blanks are old test rows with no recoverable
 * customer and are marked honestly so they stay updatable.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000001_backfill_blank_delivery_customers.sql",
);

describe("blank delivery customer backfill", () => {
  it("writes Joy / 7820582 onto blank-name dispatched rows only", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("UPDATE public.deliveries");
    expect(sql).toContain("'Joy'");
    expect(sql).toContain("'7820582'");
    expect(sql).toContain("dispatched");
  });

  it("marks remaining delivered blanks honestly instead of inventing names", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("'Unknown customer'");
    expect(sql).toContain("delivered");
    // Delivered rows also carry blank phones (sibling phone check) — the
    // marker must be non-dialable, never a real-looking number.
    expect(sql).toContain("'0000000'");
  });

  it("only touches blank names (never overwrites real customer data)", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toMatch(/btrim\s*\(\s*customer_name\s*\)\s*=\s*''/);
  });
});
