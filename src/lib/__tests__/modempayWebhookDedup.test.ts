import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * Ticket: ModemPay redelivers any non-2xx webhook up to 3x (10 min apart),
 * and our fail-closed 401 on invalid signatures guarantees redelivery.
 * The redelivery found the original row (dupOf set) but still attempted a
 * plain insert with the same event_id, dying with 23505
 * ("failed to log webhook event ... already exists") → 500 instead of a
 * duplicate-200. Prod logs 2026-09-21 show exactly this on
 * payment_intent.created:6516ceb6-....
 *
 * Fix: suffix the event_id on natural retries (same pattern as admin
 * replays) so the retry is logged and resolves as duplicate below.
 * fail-closed signature rejection is unchanged and still first.
 */

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf-8");

describe("modempay webhook natural-retry dedup", () => {
  const shared = read("../../../supabase/functions/_shared/modempay.ts");

  it("suffixes event_id on natural retries so redelivery never 500s on the unique index", () => {
    expect(shared).toContain("opts?.retryOfId || dupOf");
  });

  it("still marks the retry row duplicate with a pointer to the original", () => {
    expect(shared).toContain('await setStatus("duplicate", `Already processed as ${dupOf}`);');
  });

  it("keeps fail-closed signature rejection ahead of duplicate handling", () => {
    const sigIdx = shared.indexOf('await setStatus("invalid_signature"');
    const dupIdx = shared.indexOf('await setStatus("duplicate"');
    expect(sigIdx).toBeGreaterThan(-1);
    expect(dupIdx).toBeGreaterThan(sigIdx);
  });
});
