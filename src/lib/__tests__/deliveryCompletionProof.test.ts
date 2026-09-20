import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Anti-abuse slice 2: the UI receipt gate is bypassable via direct API, and
 * Mark Completed pays out via settlement — so the database itself must reject
 * proof-less completions. A delivery may only transition to delivered when it
 * was picked up (started run) or carries an attached receipt.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000002_require_delivery_completion_proof.sql",
);

describe("delivered completion-proof trigger", () => {
  it("defines the proof function and row trigger", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("require_delivery_completion_proof");
    expect(sql).toContain("trg_require_delivery_proof");
    expect(sql).toContain("BEFORE UPDATE ON public.deliveries");
  });

  it("requires pickup or receipt proof on the delivered transition", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("picked_up_at");
    expect(sql).toContain("receipt_attached");
    expect(sql).toMatch(/RAISE EXCEPTION.*proof/i);
  });

  it("only fires on the transition into delivered (history stays valid)", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("'delivered'");
  });

  it("keeps privileged ops corrections possible", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("has_role");
    expect(sql).toContain("admin");
  });
});
