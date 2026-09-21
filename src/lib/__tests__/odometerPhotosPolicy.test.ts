import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: Start-odometer dialog (mileage + photo) fails with
 * `new row violates row-level security policy` and the storage POST to
 * `odometer-photos/<rider_id>/<delivery_id>/start.png` returns 400.
 *
 * Root cause: the dialog uploads with `upsert: true`
 * (src/components/OdometerCaptureDialog.tsx), which requires both INSERT
 * and UPDATE privileges on storage.objects. The bucket migration
 * (20260520110631) only created INSERT + SELECT policies, so every upload
 * — even the first — was rejected by RLS.
 *
 * These tests pin the agreement between the app and the DB policies: any
 * storage operation the dialog performs must have a matching policy that
 * scopes access to the rider's own folder.
 */

const BASE_MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260520110631_793334bc-cc94-4c10-a109-7cf31ed740bd.sql",
);
const FIX_MIGRATION = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260921000001_odometer_photos_update_policy.sql",
);
const DIALOG = path.resolve(__dirname, "../../components/OdometerCaptureDialog.tsx");

function policiesFor(sql: string, bucket: string): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `CREATE POLICY\\s+"([^"]+)"\\s+ON\\s+storage\\.objects\\s+FOR\\s+(SELECT|INSERT|UPDATE|DELETE)[\\s\\S]*?bucket_id\\s*=\\s*'${bucket}'`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push(`${m[2]}:${m[1]}`);
  return out;
}

describe("odometer-photos storage policy covers the dialog", () => {
  it("dialog uploads with upsert:true (needs INSERT + UPDATE)", () => {
    const src = fs.readFileSync(DIALOG, "utf-8");
    expect(src).toContain("odometer-photos");
    expect(src).toContain("upsert");
  });

  it("base migration scopes inserts to the rider's own folder", () => {
    const sql = fs.readFileSync(BASE_MIGRATION, "utf-8");
    const policies = policiesFor(sql, "odometer-photos");
    expect(policies.some((p) => p.startsWith("INSERT:"))).toBe(true);
    expect(sql).toContain("(storage.foldername(name))[1]");
  });

  it("fix migration adds UPDATE + DELETE scoped to the rider's own folder", () => {
    const sql = fs.readFileSync(FIX_MIGRATION, "utf-8");
    const policies = policiesFor(sql, "odometer-photos");
    expect(policies.some((p) => p.startsWith("UPDATE:"))).toBe(true);
    expect(policies.some((p) => p.startsWith("DELETE:"))).toBe(true);
    // Same folder scoping as the INSERT check — riders can only touch
    // <their-rider-id>/... paths.
    expect(sql).toContain("(storage.foldername(name))[1]");
    expect(sql).toContain("user_id = auth.uid()");
  });

  it("UPDATE policy has both USING and WITH CHECK (read your writes)", () => {
    const sql = fs.readFileSync(FIX_MIGRATION, "utf-8");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("USING");
    expect(sql).toContain("WITH CHECK");
  });
});
