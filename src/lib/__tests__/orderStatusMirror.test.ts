import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: rider Start fails with
 * `new row for relation "orders" violates check constraint "orders_status_check"`.
 *
 * Root cause: mirror_delivery_status_to_order() maps delivery picked_up /
 * in_transit onto the linked order 1:1, but orders_status_check (written
 * before the mirror) omits both — so the AFTER trigger aborts the Start
 * write itself. The whole order pipeline (timeline ORDER map, merchant
 * ACTIVE_STATUSES, mirror intent) expects those statuses; the constraint is
 * the stale outlier, same bug class as deliveries_status_check.
 */

const MIRROR = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260812083713_3844693f-bd0e-401e-a8ed-0de4cc6fa9a0.sql",
);
const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000004_allow_enroute_order_status.sql",
);

function inList(sql: string, constraint: string): string[] {
  const re = new RegExp(
    constraint + "\\s+CHECK\\s*\\(\\s*status\\s+IN\\s*\\(([^)]+)\\)",
  );
  const m = sql.match(re);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

function mirrorTargets(sql: string): string[] {
  const fn = sql.slice(sql.indexOf("mirror_delivery_status_to_order"));
  const cases = [...fn.matchAll(/WHEN\s+'(\w+)'\s+THEN\s+'(\w+)'/g)];
  return [...new Set(cases.map((c) => c[2]))];
}

describe("orders_status_check allows mirrored en-route statuses", () => {
  it("migration rewrites the constraint with picked_up and in_transit", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("orders_status_check");
    expect(sql).toContain("'picked_up'");
    expect(sql).toContain("'in_transit'");
  });

  it("every mirror target is constraint-allowed (no more Start aborts)", () => {
    const mirror = fs.readFileSync(MIRROR, "utf-8");
    const fixed = fs.readFileSync(MIGRATION, "utf-8");
    const allowed = inList(fixed, "orders_status_check");
    expect(allowed.length).toBeGreaterThan(0);
    for (const target of mirrorTargets(mirror)) {
      expect(allowed).toContain(target);
    }
  });

  it("keeps all pre-existing order statuses (strict superset, no narrowing)", () => {
    const fixed = fs.readFileSync(MIGRATION, "utf-8");
    const allowed = inList(fixed, "orders_status_check");
    for (const s of [
      "pending_payment",
      "paid",
      "accepted",
      "preparing",
      "ready",
      "dispatched",
      "delivered",
      "cancelled",
      "refunded",
    ]) {
      expect(allowed).toContain(s);
    }
  });
});
