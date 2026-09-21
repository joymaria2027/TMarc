import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CI guard: `get_order_live_location` must return exactly the types its
 * RETURNS TABLE declares, or PostgREST fails every call with
 * 42804 "structure of query does not match function result type"
 * (prod incident 2026-09-21: live map stuck on error for In-Transit orders).
 *
 * Root cause: delivery_waypoints.latitude/longitude and merchants.latitude/
 * longitude are DOUBLE PRECISION (float8), but the OUT params are numeric.
 * plpgsql's RETURN QUERY does not coerce float8 -> numeric, so the four
 * float-sourced selects must cast explicitly. The declared contract itself
 * must stay numeric (client + generated types depend on it).
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");
const FN = "public.get_order_live_location";

function latestDefinition(): { file: string; body: string } {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hits = files.filter((f) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    // Definition files only: skips GRANT/REVOKE-only migrations touching the fn.
    return sql.includes(`FUNCTION ${FN}`) && sql.includes("RETURN QUERY");
  });
  expect(hits.length).toBeGreaterThan(0);
  const file = hits[hits.length - 1];
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  // Anchor on the statement at line start so header comments mentioning
  // RETURN QUERY can't shift the slice.
  const start = sql.search(/^\s*RETURN QUERY/m);
  const end = sql.indexOf("WHERE o2.id = _order_id;", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return { file, body: sql.slice(start, end) };
}

describe("get_order_live_location type contract", () => {
  it("casts all float8-sourced selects to numeric in the latest definition", () => {
    const { file, body } = latestDefinition();
    for (const expr of [
      "w.latitude::numeric",
      "w.longitude::numeric",
      "m.latitude::numeric",
      "m.longitude::numeric",
    ]) {
      expect(
        body.includes(expr),
        `${file}: RETURN QUERY must select ${expr} (float8 is not coercible to the numeric OUT param)`,
      ).toBe(true);
    }
  });

  it("keeps the declared numeric contract the client depends on", () => {
    const { file } = latestDefinition();
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const decl of ["latitude numeric", "delivery_status text"]) {
      expect(sql.includes(decl), `${file}: must keep RETURNS TABLE entry "${decl}"`).toBe(true);
    }
  });
});
