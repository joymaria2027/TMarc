import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveSignatureVerdict } from '../../../supabase/functions/_shared/modempay';

/**
 * Security contract for the one unauthenticated, publicly reachable,
 * money-moving endpoint in the platform (`supabase/config.toml` sets
 * `verify_jwt = false` for it). Its entire authentication is one HMAC check.
 *
 * That check used to FAIL OPEN: `signatureValid` was a tri-state
 * `boolean | null` where `null` meant "we never checked", but the gate tested
 * only `=== false`. With `MODEMPAY_WEBHOOK_SECRET` unset — a typo, a whitespace
 * value, a deploy that forgot it — signature enforcement silently turned off
 * and any caller could POST a `charge.succeeded` for a known `order_id`,
 * driving `payment_status = 'paid'` and crediting a merchant wallet. No log
 * line, no alert: the events table recorded the event as successfully
 * processed.
 *
 * `resolveSignatureVerdict` makes that state unrepresentable. It is pure (no
 * Deno, Supabase, or clock global), so it is unit-testable from Vitest even
 * though the module runs on the Deno edge runtime.
 */

const SECRET = 's3cret-webhook-key';
const BODY = JSON.stringify({ id: 'evt_1', event: 'charge.succeeded' });

/** Same construction as the module's `hmacHex`, so this is not a guess. */
const hmacHex = async (secret: string, body: string, hash: 'SHA-256' | 'SHA-512'): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

describe('resolveSignatureVerdict', () => {
  it('returns "valid" for an admin replay even with no secret configured', async () => {
    // The replay endpoint is admin/app_developer-gated and passes
    // skipSignature: true. It must keep working in an environment where the
    // secret is absent — this is the case that breaks if `skipSignature` is
    // checked after the secret.
    await expect(resolveSignatureVerdict(null, BODY, '', true)).resolves.toBe('valid');
    await expect(resolveSignatureVerdict(undefined, BODY, 'deadbeef', true)).resolves.toBe('valid');
  });

  it('returns "unconfigured" when the secret is missing', async () => {
    await expect(resolveSignatureVerdict(null, BODY, 'abc123')).resolves.toBe('unconfigured');
    await expect(resolveSignatureVerdict(undefined, BODY, 'abc123')).resolves.toBe('unconfigured');
  });

  it('returns "unconfigured" for an empty secret', async () => {
    await expect(resolveSignatureVerdict('', BODY, 'abc123')).resolves.toBe('unconfigured');
  });

  it('returns "unconfigured" for a whitespace-only secret', async () => {
    // A secret that trims to nothing cannot produce a matching HMAC, so it must
    // read as misconfigured rather than as a stream of 401s.
    await expect(resolveSignatureVerdict('   ', BODY, 'abc123')).resolves.toBe('unconfigured');
    await expect(resolveSignatureVerdict('\t\n ', BODY, 'abc123')).resolves.toBe('unconfigured');
  });

  it('returns "invalid" for a configured secret with no signature header', async () => {
    await expect(resolveSignatureVerdict(SECRET, BODY, '')).resolves.toBe('invalid');
  });

  it('returns "valid" for a correct HMAC-SHA512 signature', async () => {
    const sig = await hmacHex(SECRET, BODY, 'SHA-512');
    await expect(resolveSignatureVerdict(SECRET, BODY, sig)).resolves.toBe('valid');
  });

  it('returns "invalid" for a wrong signature', async () => {
    const wrong = await hmacHex('a-different-secret', BODY, 'SHA-512');
    await expect(resolveSignatureVerdict(SECRET, BODY, wrong)).resolves.toBe('invalid');
  });
});

// The pure function is unit-tested above; these assert the *wiring* — that
// processWebhookEvent actually branches on all three verdicts, and in the right
// order relative to the order/settlement mutations. Same text-grep shape as
// modempayWebhookDedup.test.ts, for the same reason: the caller is a Deno
// function that cannot be imported-and-run here.
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), 'utf-8');
const shared = read('../../../supabase/functions/_shared/modempay.ts');

describe('processWebhookEvent signature gating', () => {
  it('fails closed on an unconfigured secret with a distinct config_error status', () => {
    expect(shared).toContain('verdict === "unconfigured"');
    expect(shared).toContain('await setStatus("config_error"');
    expect(shared).toContain('MODEMPAY_WEBHOOK_SECRET is not configured');
    // A misconfigured deployment must be visible in function logs.
    expect(shared).toContain('console.error("MODEMPAY_WEBHOOK_SECRET is not configured")');
    expect(shared).toContain('{ status: 500, body: { error: "webhook not configured" }');
    // Distinct from a forgery, so an operator can tell the two apart.
    expect(shared).not.toContain('setStatus("config_error", "HMAC signature mismatch")');
  });

  it('gates the unconfigured branch ahead of every order mutation', () => {
    const gate = shared.indexOf('verdict === "unconfigured"');
    expect(gate).toBeGreaterThan(-1);

    // `submit_order` is the DB function that drives payment_status to paid and
    // calls credit_merchant_for_order internally — it is the point at which an
    // unauthenticated caller would actually move money. The order lookups and
    // updates around it must not precede the gate either, or the branch is not
    // fail-closed in any meaningful sense.
    for (const call of [
      '.from("orders")',
      'admin.rpc("submit_order"',
      '.from("orders").update({ payment_status: "failed" })',
    ]) {
      const at = shared.indexOf(call);
      expect(at, `${call} must exist in this revision`).toBeGreaterThan(-1);
      expect(at, `${call} must not precede the unconfigured gate`).toBeGreaterThan(gate);
    }
  });

  it('keeps the invalid-signature rejection ahead of duplicate handling', () => {
    // Pre-existing invariant (modempayWebhookDedup.test.ts) — the new branch
    // must not have been inserted above it.
    const sigIdx = shared.indexOf('verdict === "invalid"');
    const cfgIdx = shared.indexOf('verdict === "unconfigured"');
    const dupIdx = shared.indexOf('if (dupOf)');
    expect(sigIdx).toBeGreaterThan(-1);
    expect(cfgIdx).toBeGreaterThan(sigIdx);
    expect(dupIdx).toBeGreaterThan(cfgIdx);
  });

  it('has no tri-state boolean left in the control flow', () => {
    // The old `boolean | null` is what let "never checked" fall through.
    expect(shared).not.toContain('signatureValid');
    expect(shared).toContain('SignatureVerdict');
  });

  it('checks skipSignature before the secret inside resolveSignatureVerdict', () => {
    const fn = shared.slice(shared.indexOf('export async function resolveSignatureVerdict'));
    const skip = fn.indexOf('if (skipSignature) return "valid"');
    const secret = fn.indexOf('!secret');
    expect(skip).toBeGreaterThan(-1);
    expect(secret).toBeGreaterThan(skip);
  });
});
