import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { deliveryStatusMeta, sortDeliveries } from "../deliveries";

/**
 * Ticket: tapping Accept on a dispatched delivery toasts
 * `Accept failed: new row for relation "deliveries" violates check
 * constraint "deliveries_status_check"` and the card stays in the queue.
 *
 * Root cause: the app writes `status = 'accepted'` (RiderDashboard
 * handleAcceptDelivery; QueueCard already renders the accepted next stage),
 * but `deliveries_status_check` (last rewritten 2026-05-20, before the
 * August dispatch functions that reference 'accepted') omits it.
 *
 * These tests pin the agreement between the DB constraint and the app:
 * every status the rider lifecycle writes must be constraint-allowed, and
 * the UI must know how to display and order the accepted stage.
 */

const MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260920000000_allow_accepted_delivery_status.sql",
);

/** Statuses the rider lifecycle writes or filters on (app source of truth). */
const RIDER_LIFECYCLE_STATUSES = [
  "pending",
  "unassigned",
  "dispatched",
  "accepted",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

function allowedStatuses(sql: string): string[] {
  const m = sql.match(/CHECK\s*\(\s*status\s+IN\s*\(([^)]+)\)/);
  if (!m) return [];
  return m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

describe("deliveries_status_check allows the accepted stage", () => {
  it("migration rewrites the constraint with 'accepted' included", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("deliveries_status_check");
    expect(sql).toContain("'accepted'");
  });

  it("every rider-lifecycle status the app writes is constraint-allowed", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    const allowed = allowedStatuses(sql);
    expect(allowed.length).toBeGreaterThan(0);
    for (const s of RIDER_LIFECYCLE_STATUSES) {
      expect(allowed).toContain(s);
    }
  });
});

describe("accepted next-stage UI", () => {
  it("deliveryStatusMeta labels Accepted with a distinct (non-muted) badge", () => {
    const meta = deliveryStatusMeta("accepted");
    expect(meta.label).toBe("Accepted");
    expect(meta.badgeClassName).not.toContain("bg-muted");
  });

  it("status sort orders dispatched < accepted < in_transit", () => {
    const mk = (id: string, status: string) => ({
      id,
      status,
      updated_at: "2026-09-20T10:00:00Z",
      estimated_tariff: 10,
      merchant_id: "m-1",
      merchant_name: null,
      merchants: null,
      rider_id: "r-1",
    });
    const rows = [mk("c", "in_transit"), mk("a", "accepted"), mk("b", "dispatched")];
    const out = sortDeliveries(rows, { key: "status", dir: "asc" }).map((r) => r.id);
    expect(out).toEqual(["b", "a", "c"]);
  });
});
