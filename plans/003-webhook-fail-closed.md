# Plan 003: Fail closed when the ModemPay webhook secret is unconfigured

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- supabase/functions/_shared/modempay.ts supabase/functions/modempay-webhook/index.ts supabase/functions/modempay-webhook-replay/index.ts supabase/config.toml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-verification-baseline.md
- **Category**: security
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

The ModemPay webhook is the only unauthenticated, publicly reachable,
money-moving endpoint in this platform (`supabase/config.toml:5` sets
`verify_jwt = false` for it, correctly — it is an external payment-provider
callback). Its entire authentication is an HMAC signature check.

That check currently **fails open when the secret is absent**. If
`MODEMPAY_WEBHOOK_SECRET` is unset, misspelled, or whitespace in a deployed
environment, HMAC verification is silently disabled and any caller can POST a
`charge.succeeded` for a known `order_id` — driving `payment_status = 'paid'`
and crediting a merchant wallet. There is no log line, no alert, and no
`invalid_signature` row: the events table records the event as successfully
processed.

A sibling function in the same directory already gets this right.
`supabase/functions/modempay-create-checkout/index.ts:36-41` fails closed on a
missing `MODEMPAY_API_KEY`. This plan makes the webhook match.

## Current state

- `supabase/functions/_shared/modempay.ts` — the shared webhook processor,
  `processWebhookEvent()` at line 59. Runs on Supabase's Deno edge runtime.
- `supabase/functions/modempay-webhook/index.ts` — the public entry point.
- `supabase/functions/modempay-webhook-replay/index.ts` — an **admin-gated**
  operator endpoint that calls `processWebhookEvent` with
  `{ retryOfId, skipSignature: true }`.
- `supabase/config.toml:5` — `[functions.modempay-webhook] verify_jwt = false`.

The defect, verbatim from `_shared/modempay.ts:64-70`:

```ts
  const webhookSecret = Deno.env.get("MODEMPAY_WEBHOOK_SECRET");
  let signatureValid: boolean | null = null;
  if (webhookSecret && !opts?.skipSignature) {
    if (!signatureHeader) signatureValid = false;
    else signatureValid = await isValidSignature(webhookSecret, rawBody, signatureHeader);
  }
```

and the gate at line 129:

```ts
  if (signatureValid === false) {
    // Fail closed: an invalid HMAC is rejected outright. Triage happens
    // out-of-band via the events table (or an admin replay), never inline.
    await setStatus("invalid_signature", "HMAC signature mismatch");
    return { status: 401, body: { error: "invalid signature" }, logId: logRow.id };
  }
```

`signatureValid` has **three** possible values: `true`, `false`, and `null`.
`null` means "we never checked" — but the gate only tests `=== false`, so
`null` falls through and processing continues to order submission and merchant
wallet crediting (lines ~204-218).

The root cause is a **tri-state value collapsed into a two-state check**. The
fix is to make the tri-state explicit and give every state a branch.

**The correct pattern already in this repo**, from
`modempay-create-checkout/index.ts:36-41`:

```ts
    const apiKey = Deno.env.get("MODEMPAY_API_KEY");
    if (!apiKey) {
      // Fail closed: never simulate payments in a deployed function.
      console.error("MODEMPAY_API_KEY is not configured");
      return json({ error: "payment unavailable" }, 500);
    }
```

**Important constraint — Deno is not installed in this environment.** The
`_shared` module runs on Supabase's Deno runtime and references the `Deno`
global, so it cannot be imported by Vitest as-is. You therefore cannot write a
Vitest unit test that calls `processWebhookEvent` directly. Extract the
signature decision into a **pure exported function** that takes the secret as a
parameter and touches no Deno or Supabase global — that *is* testable from
Vitest. Do not attempt to install Deno or add a Deno runner in this plan.

**Repo test conventions:** Vitest with `globals: true`; test files live in
`src/lib/__tests__/`. Because the security boundary here is a Deno module, the
repo's established convention for DB/boundary guards is a text-grep contract
test — see `src/lib/__tests__/modempayWebhookDedup.test.ts` and
`src/lib/__tests__/paymentSecurityGuards.test.ts`. Use **both**: a real unit
test for the extracted decision function, plus a text-grep test asserting the
caller branches on all three states. Match `modempayWebhookDedup.test.ts`'s
structure (a `read()` helper over `fs.readFileSync`, `describe`/`it`).

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Tests     | `npm test -- modempay`                 | all matching tests pass |
| Tests     | `npm test`                             | 803+ passed, 0 failed |
| Typecheck | `npm run typecheck`                    | exit 0 (added by plan 002) |
| Lint      | `npx eslint supabase/functions/_shared/modempay.ts` | no new errors |

Note: `supabase/functions/**` is not covered by any tsconfig, so
`npm run typecheck` will not check your edit. Lint it explicitly as above.

## Scope

**In scope** (the only files you should modify):
- `supabase/functions/_shared/modempay.ts`
- `src/lib/__tests__/modempaySignatureGate.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- `supabase/functions/modempay-create-checkout/index.ts` — already fail-closed; do not modify.
- `supabase/functions/modempay-webhook-replay/index.ts` — the admin replay
  legitimately passes `skipSignature: true` and must **keep working**. Your
  change must not break it (see step 3).
- `supabase/migrations/**` — no schema change is needed for this fix.
- `supabase/config.toml` — `verify_jwt = false` is correct for an external
  provider callback. Do not "fix" it.
- `supabase/functions/settlement-e2e/index.test.ts` — a Deno test for a
  different subsystem. Not touched.
- The three related-but-separate defects listed in Maintenance notes.

## Git workflow

- Branch: `advisor/003-webhook-fail-closed`
- Conventional Commits, matching observed repo style (e.g.
  `fix(webhook): suffix event_id on natural retries to stop duplicate-key 500s`):
  - `fix(webhook): fail closed when the webhook secret is unconfigured`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract a pure signature-decision function

In `supabase/functions/_shared/modempay.ts`, add an exported function above
`processWebhookEvent` (which starts at line 59). It must take the secret as an
argument and reference **no** globals — no `Deno`, no `admin`, no `Date`:

```ts
export type SignatureVerdict = "valid" | "invalid" | "unconfigured";

export async function resolveSignatureVerdict(
  secret: string | null | undefined,
  rawBody: string,
  signatureHeader: string,
  skipSignature = false,
): Promise<SignatureVerdict> {
  if (skipSignature) return "valid";
  if (!secret || !secret.trim()) return "unconfigured";
  if (!signatureHeader) return "invalid";
  return (await isValidSignature(secret, rawBody, signatureHeader)) ? "valid" : "invalid";
}
```

`isValidSignature` already exists in this file (line 23) and is a pure async
helper — reuse it, do not reimplement.

The three-valued return type is the whole point: it makes the bug
unrepresentable. A future edit cannot collapse "never checked" into "valid"
without changing the type.

### Step 2: Branch on all three states in `processWebhookEvent`

Replace the current lines 64-70 and the line-129 gate with a single call and a
three-way branch.

Immediately after the webhook event row is logged (so triage still has a row to
look at — this matches the existing `invalid_signature` behavior, and there is
already a `setStatus` helper defined around line 123), branch:

```ts
  const verdict = await resolveSignatureVerdict(
    Deno.env.get("MODEMPAY_WEBHOOK_SECRET"), rawBody, signatureHeader, opts?.skipSignature,
  );

  if (verdict === "invalid") {
    await setStatus("invalid_signature", "HMAC signature mismatch");
    return { status: 401, body: { error: "invalid signature" }, logId: logRow.id };
  }
  if (verdict === "unconfigured") {
    // Fail closed: a missing secret means signature enforcement is OFF.
    // Processing anyway would let any caller mark an order paid.
    console.error("MODEMPAY_WEBHOOK_SECRET is not configured");
    await setStatus("config_error", "MODEMPAY_WEBHOOK_SECRET is not configured");
    return { status: 500, body: { error: "webhook not configured" }, logId: logRow.id };
  }
```

Three requirements:
- The `unconfigured` branch must come **before** any order lookup, order
  mutation, or `credit_merchant_for_order` call. Verify nothing between the
  signature gate and the success branch can run.
- Log with `console.error` (matching the `create-checkout` precedent) so a
  misconfigured deployment is visible in function logs.
- Use a **distinct** status string `config_error`, not `invalid_signature`, so
  operators can tell "someone forged this" from "we are misconfigured". Confirm
  `modempay_webhook_events.processing_status` is free-text (no CHECK constraint
  on it) before relying on this — grep the migrations; if it *is* constrained,
  use the nearest existing allowed value and say so in a comment.

Delete the old `signatureValid` variable entirely. Do not leave it behind as
dead code.

**Verify**: `grep -n "signatureValid" supabase/functions/_shared/modempay.ts` → no output.

### Step 3: Prove the admin replay path still works

`modempay-webhook-replay/index.ts:34` calls:

```ts
processWebhookEvent(..., { retryOfId: evt.id, skipSignature: true })
```

With `skipSignature: true`, step 1's function returns `"valid"` immediately —
before the secret is consulted — so replay is unaffected. **Confirm this by
reading your own step-1 code**: the `skipSignature` check must come *first* in
`resolveSignatureVerdict`, before the `!secret` check. If you reorder those two
lines, admin replay breaks in a deployed environment with no secret.

Note the replay endpoint is admin-gated (`index.ts:21-25` checks
`admin`/`app_developer`), which is why skipping the signature there is
legitimate. Do not add authz to it in this plan.

**Verify**: re-read `resolveSignatureVerdict` and confirm `skipSignature` is the
first branch. Then `grep -n "skipSignature" supabase/functions/_shared/modempay.ts`
shows both the definition and the `processWebhookEvent` call site.

## Test plan

Create `src/lib/__tests__/modempaySignatureGate.test.ts` with two describes.

**Describe 1 — `resolveSignatureVerdict` (real unit tests, no mocks).**
Import the function directly:

```ts
import { resolveSignatureVerdict } from "../../../supabase/functions/_shared/modempay";
```

Cases:
1. `skipSignature: true` with a `null` secret → `"valid"` (admin replay must
   work even with no secret configured).
2. `null` secret, no skip → `"unconfigured"`.
3. `""` (empty string) secret → `"unconfigured"`.
4. `"   "` (whitespace-only) secret → `"unconfigured"`.
5. Configured secret + empty signature header → `"invalid"`.
6. Configured secret + a correct HMAC → `"valid"`. Compute the expected
   signature with `crypto.subtle` in the test using the same SHA-512 HMAC the
   module uses (`hmacHex`, line 3).
7. Configured secret + a wrong signature → `"invalid"`.

> **If the import in case 1 fails** because the module transitively touches
> `Deno` at import time, that is a STOP condition — report it. It should not
> happen because all `Deno` references in the file are inside function bodies,
> not at module top level. Do not refactor the whole module to work around it.

**Describe 2 — `processWebhookEvent` wiring (text-grep contract test).**
Follow the exact structure of `src/lib/__tests__/modempayWebhookDedup.test.ts`
(a `read()` helper over `fs.readFileSync` of the `_shared` file). Assert:
- The source contains a `config_error` status branch.
- The `unconfigured` branch returns a 500.
- The `config_error` branch appears **before** the `credit_merchant_for_order`
  call and before any `orders` update — compare `indexOf` positions.
- `signatureValid` no longer appears anywhere in the source (the old tri-state
  is gone).
- The `invalid` branch still precedes the `duplicate` branch (preserve the
  existing invariant that `modempayWebhookDedup.test.ts:32-37` already asserts).

**Verification**: `npm test -- modempay` → all pass, including the 7 new unit
cases. `npm test` → 810+ passed, 0 failed.

## Done criteria

ALL must hold:

- [ ] `npm test -- modempaySignatureGate` exits 0 with 7+ tests passing
- [ ] `grep -c "signatureValid" supabase/functions/_shared/modempay.ts` returns `0`
- [ ] `grep -n "config_error" supabase/functions/_shared/modempay.ts` shows the new branch
- [ ] The `unconfigured` branch is textually before the `credit_merchant_for_order` call site
- [ ] `resolveSignatureVerdict` checks `skipSignature` before `!secret`
- [ ] `npm test` exits 0 (810+ tests, 0 failed)
- [ ] `npx eslint supabase/functions/_shared/modempay.ts` introduces no new errors
- [ ] `git status --porcelain` shows only the 2 in-scope files
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `modempay_webhook_events.processing_status` has a CHECK constraint or enum
  that does not permit `config_error`. Use the nearest permitted value and
  comment it — but if the constraint would force you to reuse
  `invalid_signature`, stop and report, because that loses the operator signal
  this plan exists to create.
- Importing `_shared/modempay.ts` from a Vitest test fails at module load. The
  file should have no top-level `Deno` access; if it does, that is a larger
  problem — report it rather than restructuring the module.
- You cannot determine the correct HMAC construction for test case 6. Read
  `hmacHex` (line 3) and `isValidSignature` (line 23) — including the body
  variants at lines 30-31 — rather than guessing. Guessing here produces a
  test that passes for the wrong reason.
- The fix appears to require modifying `modempay-webhook-replay/index.ts`. It
  must not.
- `npm test` fails in a file you did not touch.

## Maintenance notes

- **What a reviewer should scrutinise:** the ordering guarantees. Two of them
  are load-bearing and easy to break in a future refactor: (a) the
  `unconfigured` branch must stay ahead of every order mutation, and (b) inside
  `resolveSignatureVerdict`, `skipSignature` must stay ahead of the
  `!secret` check. Both are asserted by the tests; if you need to reorder
  either, the tests should fail — verify that they do.
- **Deployment note for the human who owns this:** the `console.error` on the
  `unconfigured` path is the intended alarm. After deploying, confirm the
  function logs contain no `MODEMPAY_WEBHOOK_SECRET is not configured` lines.
  If they do, the secret is missing in that environment and **every webhook
  since that deploy was unauthenticated** — rotate the secret and audit
  `modempay_webhook_events` for `payment_status` transitions in that window.
  Say this in the PR description; it is the operational half of this fix.
- **Interaction:** plans 004-007 add migrations to `supabase/migrations/`.
  This plan adds none, so it is order-independent with respect to them.
- **Deferred, deliberately — three separate defects in this same function.**
  Each is a real finding from the audit but a distinct change; do not fold them
  in here:
  1. `*.updated` events carrying a failure status (`canceled`/`expired`/
     `failed`) match neither the success nor the failure branch, so they land in
     the terminal `else` → `setStatus("ignored", …)` → HTTP 200. A payment that
     succeeds then fails leaves the Order `pending` forever, and ModemPay never
     retries. The `isFail` test at ~line 164 examines only the event *type*,
     while the success test at ~163 also inspects the inner status field.
  2. The `order_payment_verifications` upsert (~line 183) runs
     `onConflict: "order_id,provider"` with no comparison against the stored
     row and happens **before** the already-paid check, so a later event
     overwrites `verified_amount` and can downgrade `amount_covers_order` from
     `true` to `false` on an order that is already paid and credited.
  3. The dedup window between the `maybeSingle()` existence check (~line 89) and
     the insert (~line 99) lets two concurrent redeliverings both pass the
     check, with the loser hitting the unique index and returning
     `{ status: 500, body: { error: "log_failed" } }` — a genuine duplicate
     reported to the provider as a server failure.
