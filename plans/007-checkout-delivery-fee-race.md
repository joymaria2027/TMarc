# Plan 007: Stop checkout writing a zero delivery fee

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- src/pages/CheckoutPage.tsx src/lib/deliveryFee.ts src/lib/cart.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-verification-baseline.md
- **Category**: bug
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

Checkout resolves each Merchant's delivery fee in an async `useEffect`. The
effect's dependencies do not include `groups`, the address is debounced by
400 ms, and the submit handler reads the fee map with a `?? 0` fallback and no
check that the lookup has actually resolved. Tapping Pay while the lookup is
in flight — or immediately after editing the address, inside the debounce
window — creates the Order with `delivery_fee = 0` and `total = subtotal`.

The customer is then charged the subtotal only through the genuine ModemPay
flow, so nothing fails and nothing looks wrong. The delivery-fee revenue is
simply lost, silently, on every order placed during that window.

This is the last plan in the set because it is the only one that is neither a
security hole nor a ledger-corruption bug — it is lost revenue plus a customer
charged the wrong amount. Fix it, but it does not outrank the money-integrity
work.

## Current state

- `src/pages/CheckoutPage.tsx` — the cart → Order → ModemPay flow.
- `src/lib/deliveryFee.ts` — `resolveDeliveryFee(merchantId, address)`, imported
  at `CheckoutPage.tsx:20`. Read it; know whether it can return `null`/`NaN` or
  only a number, because that changes the guard.
- `src/lib/cart.ts:73` — computes the displayed `subtotal`; also unrounded
  (see "Deferred" below).

The effect, `src/pages/CheckoutPage.tsx:80-96`:

```tsx
  // resolve per-merchant delivery fee whenever fulfillment/debounced address/groups change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const merchantIds = Object.keys(groups);
      if (fulfillment === "pickup") {
        setFees(Object.fromEntries(merchantIds.map(id => [id, 0])));
        return;
      }
      const entries = await Promise.all(merchantIds.map(async id => {
        const fee = await resolveDeliveryFee(id, debouncedAddress);
        return [id, fee] as const;
      }));
      if (!cancelled) setFees(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, debouncedAddress, items.length]);
```

Three defects visible here:

1. `groups` is **not** in the dependency array (and the `exhaustive-deps` rule is
   explicitly disabled at line 95). The effect re-keys on `items.length`, so a
   Merchants-set change that keeps the item count constant (e.g. swapping one
   Merchant's product for another's) leaves stale fees.
2. `debouncedAddress` lags the real `address` by the debounce interval, so for
   that window `fees` describes the *previous* address.
3. There is no "resolved" signal. `fees` starts as `{}` and nothing distinguishes
   "not looked up yet" from "looked up, fee is 0".

The submit handler reads it unguarded, `src/pages/CheckoutPage.tsx:207-217`:

```tsx
      for (const mid of merchantIds) {
        const gItems = groups[mid];
        const gSubtotal = gItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const gFee = fees[mid] ?? 0;
        const gTotal = gSubtotal + gFee;

        const { data: order, error: oErr } = await supabase.from("orders").insert({
          customer_id: customer.id,
          merchant_id: mid,
          fulfillment_type: fulfillment,
          subtotal: gSubtotal, delivery_fee: gFee, total: gTotal,
          …
```

And the displayed total sums **all** keys in `fees`,
`src/pages/CheckoutPage.tsx:102`:

```tsx
  const totalDeliveryFees = Object.values(fees).reduce((a, b) => a + b, 0);
```

which includes Merchants no longer in the cart, so the displayed grand total can
disagree with what any Order is created for. The Pay button
(`CheckoutPage.tsx:449-451`) is disabled only for `submitting` and
`wholesaleViolations` — never for an unresolved fee.

## Design

- Gate on **completeness**, not on a timer: every Merchant id currently in
  `groups` must have an entry in `fees`. That is the actual precondition for
  `gFee = fees[mid]` being meaningful, and it is self-correcting when `groups`
  changes.
- Keep the `?? 0` default as a defensive fallback but make it unreachable in the
  normal path.
- Derive `totalDeliveryFees` from the same `Object.keys(groups)` source so the
  display and the write agree by construction.
- Do **not** try to fix the debounce itself — 400 ms is a reasonable UX choice.
  Gating the button is the correct fix.

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Tests     | `npm test -- Checkout`         | all pass |
| Tests     | `npm test`                     | 803+ passed, 0 failed |
| Typecheck | `npm run typecheck`            | exit 0 |
| Lint      | `npx eslint src/pages/CheckoutPage.tsx` | no new errors; no new `exhaustive-deps` disable |

## Scope

**In scope**:
- `src/pages/CheckoutPage.tsx`
- `src/pages/__tests__/checkoutDeliveryFee.test.tsx` (create)

**Out of scope** (do NOT touch):
- `src/lib/deliveryFee.ts` — read it to understand the return shape; it is not
  the bug. If you conclude it *is* buggy, report that separately.
- `src/lib/cart.ts` — the float-rounding issue there is real but separate
  (see "Deferred").
- `supabase/**` — no database change is needed. `submit_order`'s existing
  `subtotal` guard (plan 005 extends it to `total`) is unaffected by this fix.
- `ModemPay` amount handling in `supabase/functions/**` — plan 003's territory.
- The other `useEffect` dependency suppressions elsewhere in the file. Fix only
  this one; a repo-wide `exhaustive-deps` cleanup is a separate change.

## Git workflow

- Branch: `advisor/007-checkout-fee-race`
- Conventional Commits, matching observed repo style (e.g.
  `fix(chat): mirror order chat bubbles by viewer role`):
  - `fix(checkout): block order placement until delivery fees resolve`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Derive a `feesResolved` flag

In `src/pages/CheckoutPage.tsx`, compute completeness from the same source
`submit()` uses:

```tsx
  const feeMerchantIds = Object.keys(groups);
  const feesResolved =
    fulfillment === "pickup" ||
    (feeMerchantIds.length > 0 && feeMerchantIds.every((id) => id in fees));
```

Place it near the existing `totalDeliveryFees` derivation (line 102) so the
display and the guard read the same `groups`.

Read the surrounding code first to learn the actual name of the groups variable
and its type — the plan uses `groups` as it appears at line 83, but confirm
before writing.

### Step 2: Fix the displayed total

Replace line 102:

```tsx
  const totalDeliveryFees = Object.values(fees).reduce((a, b) => a + b, 0);
```

with a sum over the Merchants actually in the cart:

```tsx
  const totalDeliveryFees = feeMerchantIds.reduce((sum, id) => sum + (fees[id] ?? 0), 0);
```

This makes the displayed grand total and the written `total` agree by
construction, and it is the same iteration order `submit()` uses.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Add `groups` to the effect dependencies

In the `useEffect` dependency array at line 95, add `groups`. Because `groups` is
derived from the cart it is likely a new object identity every render, which
would loop the effect — so check how `groups` is produced (grep for its
definition) and, if it is not memoized, wrap it in `useMemo` on its real inputs
first. Do **not** simply re-add the `eslint-disable-next-line` comment without
understanding this; the disable is what hid the bug.

Keep the `cancelled` flag and the cleanup exactly as they are.

**Verify**: `npx eslint src/pages/CheckoutPage.tsx 2>&1 | grep exhaustive-deps` →
either nothing, or the remaining disable is on a different effect.

### Step 4: Block the Pay button until fees resolve

The button at lines 449-451:

```tsx
        <Button
          size="lg"
          className="w-full"
          disabled={submitting || wholesaleViolations.length > 0}
```

Add the guard:

```tsx
          disabled={submitting || !feesResolved || wholesaleViolations.length > 0}
```

And extend the label ternary (lines 455-461) with a resolving state **before** the
`submitting` branch, so the user gets an honest reason rather than a dead
button:

```tsx
            : !feesResolved
            ? "Calculating delivery fees…"
```

Match the file's existing ternary style and keep the `aria-describedby` wiring
consistent.

**Verify**: `npm test` → passes; `npm run typecheck` → exit 0.

### Step 5: Make `submit()` defensive

In `submit()` (around line 207), before the per-Merchant loop, bail out if fees
are unresolved. Do not rely on the button alone — `submit` can also be reached
by keyboard submission or a programmatic call:

```tsx
    if (!feesResolved) {
      toast.error("Still calculating delivery fees — try again in a moment.");
      return;
    }
```

`sonner`'s `toast` is already imported in this file (verify before assuming).

Optionally make the inner read `const gFee = fees[mid] ?? 0;` throw instead of
defaulting, so a future gap is loud rather than silent. Choose one and say
which in the PR — do not leave both a silent default and a guard that appears to
cover it.

**Verify**: `npm test` → passes; `npm run typecheck` → exit 0.

## Test plan

Create `src/pages/__tests__/checkoutDeliveryFee.test.tsx`. Read
`src/pages/__tests__/checkoutPostOrder.test.ts` first — it already covers
`submit()`'s Order-creation path and is the pattern to follow; reuse its
`supabase` mock setup rather than inventing a new one.

Cases:

1. **The regression.** With `resolveDeliveryFee` mocked to a promise that has
   not resolved, the Pay button is disabled and its label reads
   "Calculating delivery fees…".
2. **Happy path.** Once the mock resolves, the button is enabled and clicking it
   inserts an Order whose `delivery_fee` equals the resolved fee (assert the
   exact insert payload object).
3. **`submit()` is defensive.** Invoke `submit()` directly while fees are
   unresolved and assert **no** `orders` insert occurred and a toast fired.
   This is the case that survives a future button regression.
4. **Stale Merchants are not summed.** With `fees` containing an entry for a
   Merchant no longer in `groups`, the displayed total excludes it. Assert the
   insert payload's `total`, not the rendered string, so the test does not
   depend on copy.
5. **Pickup short-circuits.** With `fulfillment === "pickup"`, fees resolve to
   `0` immediately and the button is enabled without waiting on
   `resolveDeliveryFee`.

Mock `@/lib/deliveryFee`'s `resolveDeliveryFee` with `vi.mock` and control
resolution with a deferred promise you resolve inside the test.

**Verification**: `npm test` → 803 + 5 passing, 0 failed.

## Done criteria

ALL must hold:

- [ ] `feesResolved` is derived from `Object.keys(groups)` and gates the Pay button
- [ ] The Pay button label has a resolving state
- [ ] `submit()` returns early when `!feesResolved`, with a toast
- [ ] `totalDeliveryFees` sums over `feeMerchantIds`, not `Object.values(fees)`
- [ ] `groups` is in the fee effect's dependency array, and `groups` is memoized if it is not already
- [ ] `npm test -- checkoutDeliveryFee` exits 0 with 5 tests
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` → `CheckoutPage.tsx` produces no new errors
- [ ] `npm run build` exits 0
- [ ] `git status --porcelain` shows only in-scope files
- [ ] `plans/README.md` status row for 007 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `groups` is recomputed on every render and **cannot** be memoized without a
  larger refactor of the cart state. Adding `groups` to the dependency array
  would then cause an effect loop, which is worse than the current bug. Report
  it and propose the memoization separately rather than shipping a loop.
- `resolveDeliveryFee` can return `null`, `undefined`, or `NaN`. Then `?? 0` is
  not merely a defensive fallback — it is hiding a real failure, and the fix
  must distinguish "fee is 0" from "fee lookup failed". Report what the function
  can return before writing the guard.
- `toast` is not already imported in `CheckoutPage.tsx` and adding the import
  would conflict with an existing local name.
- The existing `checkoutPostOrder.test.ts` mock setup cannot express a
  controllable pending promise. Report it rather than rewriting that test —
  other coverage depends on it.
- Fixing the displayed total changes a snapshot or copy assertion elsewhere. The
  `src/pages/__tests__/copyAudit.test.ts` file exists and may assert on checkout
  copy; if it fails, read the failure before changing the test.

## Maintenance notes

- **What a reviewer should scrutinise:** step 3. Adding `groups` to the deps is
  only safe if `groups` is referentially stable; the disable comment at line 95
  is what allowed the stale-fee bug, so removing it is the point of the step.
- **This is the pattern to reuse.** Any page that resolves a value async and
  then writes it has the same shape of bug. If you find another instance, it
  belongs in its own plan — do not expand scope here.
- **Deferred, real, and not in this plan:** money is computed as IEEE-754
  `number` end to end with no integer-cents representation and no shared
  rounding helper. `gSubtotal` at line 209 and `line_total` at line 229 are
  unrounded; the DB column is `NUMERIC(12,2)` and quantises silently on write, so
  the value stored can differ from the value sent to the gateway. There are
  roughly six independent recomputation sites. A single shared `roundMoney`
  helper applied at the three write boundaries is a cheap first step; a full
  integer-cents migration is a separate, larger piece of work.
- **Interaction:** plan 005 adds an `orders.total` assertion to `submit_order`.
  That is unaffected by this plan — with the fee correctly resolved, a correct
  order satisfies `total = subtotal + delivery_fee`. This plan is what stops
  that assertion from firing on legitimate checkouts.
- **No migration needed**, so this plan is order-independent with respect to
  plans 004–006.
