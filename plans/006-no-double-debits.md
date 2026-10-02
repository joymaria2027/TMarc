# Plan 006: Eliminate the two double-debit paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- src/pages/WalletPage.tsx src/components/wallet/WithdrawalRequestsTable.tsx src/pages/PayrollPage.tsx src/lib/moneyGuards.ts supabase/migrations`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002-verification-baseline.md, plans/005-money-ledger-integrity.md
- **Category**: bug
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

Two independent paths let the platform debit a wallet twice for a single
obligation.

**Withdrawals.** The bulk approve/reject action writes
`status = 'manager_approved'` (or `'rejected'`) with **no status predicate** on
the update. The per-row buttons correctly refuse to act on a `completed`
withdrawal, but the row checkbox is not disabled for completed rows, so a
manager can select one. Approving a selection containing a `completed` row
rewinds it to `manager_approved`; it then looks like "Awaiting Accountant",
can be finalized again, and `process_withdrawal_completion` runs the wallet
debit a second time. The `payout` row seeded into Reconciliation at first
completion is also now inconsistent with the request.

**Payroll.** `run_payroll` has no idempotency guard and `payroll_runs` has no
unique constraint on `(assignment_id, period_start, period_end)`. The only
client-side protection is an in-flight `running` flag, which resets when the
dialog closes. Re-running the same period double-debits the payer wallet and
double-credits the payee, and `payroll_runs` is a plain append-only log, so
nothing surfaces the duplicate.

Both are user-reachable through normal UI interaction, not just crafted
requests. The good news: the repo already contains the exact abstraction needed
to fix the first one, and it is already used for the analogous Delivery case.

## Current state

### 1. The bulk withdrawal write

`src/pages/WalletPage.tsx:373-390`:

```tsx
    for (const id of ids) {
      const base = {
        processed_by: user!.id,
        processed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('withdrawal_requests')
        .update(action === 'approve'
          ? { ...base, status: 'manager_approved' }
          : { ...base, status: 'rejected', notes: 'Bulk rejected by manager' })
        .eq('id', id);
      results.push({ id, error });
    }
```

No `.eq('status', …)` and no `.in('status', …)`. Contrast the **per-row** buttons
in `src/components/wallet/WithdrawalRequestsTable.tsx:301,306`, which do gate on
`wr.status === 'pending'` / `'manager_approved'`.

The row checkbox at `WithdrawalRequestsTable.tsx:287-288` has no `disabled`
prop keyed on status, and the bulk bar at `:237,246` fires regardless of the
selected rows' status.

The re-entry is possible because the completion guard is a *transition* check —
`supabase/migrations/20260520092149_f00bedad-d7a5-40e4-aeaa-50e65fe6c3bd.sql:210`:

```sql
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
```

Rewinding to `manager_approved` satisfies `OLD.status IS DISTINCT FROM
'completed'` on the next finalize, so the debit runs again.

The repo already has a fraud check for the orphan case —
`supabase/migrations/20260920000003_delivered_no_proof_fraud_check.sql:93` looks
for completed withdrawals with no debit ledger row — but that catches a
*missing* row, not a duplicated one.

### 2. The reusable precedent you should extend

`src/lib/moneyGuards.ts` already contains precisely the abstraction this fix
needs, and it is already applied to Deliveries:

- `partitionPayoutDeliveries<T extends PayoutDelivery>(deliveries)` at line 21 —
  splits a bulk selection into `approvable` and `skippedNoRatio` so ineligible
  rows are *reported*, not silently dropped.
- `summarizeBulkResult(results: BulkWriteResult[])` at line 51 — returns
  `{ succeeded, failed, failedIds }`.
- `bulkResultMessage(summary, action)` at line 62 — honest partial-failure copy
  that names the failed ids.

Its doc comment states the intent: *"the UI must say exactly which rows landed
and which did not instead of a bare per-id error toast"*. The withdrawal bulk
path already calls `summarizeBulkResult` (at `WalletPage.tsx:387`) but does not
partition first — which is the gap.

`src/lib/__tests__/moneyGuards.test.ts` is the test file to extend.

### 3. Payroll

`supabase/migrations/20260520120446_9f0f3e62-edfa-4b9d-87f7-74d3eeb039b9.sql:287-298`:

```sql
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.payroll_assignments(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_amount NUMERIC NOT NULL,
  payer_wallet_id UUID NULL,
  payee_wallet_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  run_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

No `UNIQUE` on `(assignment_id, period_start, period_end)`. And `status` has a
`'completed'` default that nothing ever varies — the client offers `pending` and
`failed` filter options at `src/pages/PayrollPage.tsx:508-512` that can never
match anything.

`run_payroll` (same file, 307-377) opens with no existence check and
unconditionally debits payer / credits payee at 361-370.

The only client guard, `src/pages/PayrollPage.tsx:253-272`:

```tsx
  const runPayroll = async () => {
    if (!runDialog || running) return;
    const periodError = validateRunPeriod(runForm.period_start, runForm.period_end);
    if (periodError) { setRunError(periodError); return; }
    …
      const { error } = await supabase.rpc('run_payroll', { … });
```

`running` is cleared in a `finally`, so the same period can be run again as soon
as the dialog closes.

## Design

- **Withdrawals: partition, then predicate the write.** Do not rely on the
  client-side partition alone — also add the status filter to the `.update()`
  so a concurrent status change between selection and write is still rejected
  by the database. Belt and braces, because this is money.
- **Payroll: enforce in the database.** A unique constraint plus an early exit
  in `run_payroll` is the only thing that survives two accountants clicking at
  the same time. A client-side pre-check is a UX nicety, not a control.
- Keep the client honest in both cases: report skipped rows rather than
  silently dropping them, matching `partitionPayoutDeliveries`' documented
  behavior.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Tests     | `npm test -- moneyGuards`        | all pass |
| Tests     | `npm test`                       | 803+ passed, 0 failed |
| Typecheck | `npm run typecheck`              | exit 0 |
| Lint      | `npx eslint src/lib/moneyGuards.ts src/pages/WalletPage.tsx src/pages/PayrollPage.tsx` | no new errors |

## Scope

**In scope**:
- `src/lib/moneyGuards.ts` (add `partitionWithdrawableRequests`)
- `src/lib/__tests__/moneyGuards.test.ts` (extend)
- `src/pages/WalletPage.tsx` (partition + predicate the bulk write)
- `src/components/wallet/WithdrawalRequestsTable.tsx` (disable the checkbox for non-actionable rows)
- `src/pages/PayrollPage.tsx` (surface an already-run period; drop the dead status filters)
- `supabase/migrations/<new>_payroll_run_idempotency.sql` (create)
- `src/lib/__tests__/payrollRunIdempotency.test.ts` (create)

**Out of scope** (do NOT touch):
- Any **existing** migration.
- `supabase/migrations/20260520120446_…` — read `run_payroll`'s current body
  from it; redefine in your new migration with `CREATE OR REPLACE`.
- `process_withdrawal_completion` — plan 005 owns the debit ordering.
- `src/lib/finance.ts` and its tests — unrelated helpers.
- `SettlementsPage.tsx` / `partitionPayoutDeliveries` — already correct; do not
  "fix" the Deliveries path.
- The other bulk-write paths (`DeliveriesPage.tsx:268,277`, `FraudPage.tsx:92`) —
  they set `is_flagged`, which carries no money. Out of scope.

## Git workflow

- Branch: `advisor/006-no-double-debits`
- Conventional Commits, matching observed repo style (e.g.
  `fix(finance): hold proof rows out of bulk settlement approval`):
  - `fix(finance): guard bulk withdrawal writes on current status`
  - `fix(payroll): make run_payroll idempotent per assignment and period`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `partitionWithdrawableRequests` to moneyGuards

Add to `src/lib/moneyGuards.ts`, next to `partitionPayoutDeliveries` (keep the
file's existing comment style — it explains *why*, not *what*):

```ts
export interface WithdrawalRequest {
  id: string;
  status: string;
}

/**
 * Split a manager's bulk withdrawal selection by whether the row is still in a
 * state this action can legally move. A 'completed' withdrawal must never be
 * rewound to 'manager_approved': finalize would then run the wallet debit a
 * second time. Skipped rows are reported, not silently dropped.
 */
export function partitionWithdrawableRequests<T extends WithdrawalRequest>(
  requests: T[],
  action: 'approve' | 'reject',
): { actionable: T[]; skippedWrongState: T[] } { /* … */ }
```

Rules: `approve` acts only on `status === 'pending'`; `reject` acts only on
`status === 'pending'` or `'manager_approved'`. Confirm those are the real
status values by reading the status label map at
`src/components/wallet/WithdrawalRequestsTable.tsx:56-69` — note that map has 5
entries in `map` but only 4 in `labels`, which is a **separate pre-existing
defect** (a `processing` withdrawal renders a raw lowercase word). Do not fix
it here; note it in the PR.

Export any status constant set you introduce so `WalletPage.tsx` and the table
share one definition.

**Verify**: `npm test -- moneyGuards` → existing tests still pass.

### Step 2: Test the partition exhaustively

Extend `src/lib/__tests__/moneyGuards.test.ts`. Cover **every** status value
found in the label map, crossed with both actions:

- `approve` on `pending` → actionable
- `approve` on `manager_approved` → skipped
- `approve` on `completed` → skipped ← **the regression this plan exists for**
- `approve` on `rejected` → skipped
- `approve` on any other status present in the map → skipped
- `reject` on `pending` → actionable
- `reject` on `manager_approved` → actionable
- `reject` on `completed` → skipped
- empty input → both arrays empty
- input where every row is skipped → `actionable` empty, `skippedWrongState`
  holds everything (this is the case that must produce an honest message, not a
  silent no-op)

**Verify**: `npm test -- moneyGuards` → all pass, including ≥10 new cases.

### Step 3: Partition and predicate the bulk write in WalletPage

In `src/pages/WalletPage.tsx`, inside the bulk handler (around line 370), after
`const ids = Array.from(withdrawSelectedIds);`:

Partition the selected rows before writing. You need the rows' statuses — read
them from the already-loaded list in component state (the same source
`WithdrawalRequestsTable` receives as its `requests` prop) rather than issuing
a new query. Confirm what that variable is actually called before writing code;
do not guess.

Then:

- If `actionable` is empty, show `bulkResultMessage`-style copy saying nothing
  was changed and why, and **return without writing**.
- Add the status filter to the update so the database enforces it too:

```tsx
      const { error } = await supabase
        .from('withdrawal_requests')
        .update(…same payload as today…)
        .eq('id', id)
        .in('status', allowedStatuses);   // approve → ['pending']; reject → ['pending','manager_approved']
```

Import `allowedStatuses` from `moneyGuards` — do not re-declare the literals in
the page.

Report skipped rows in the toast using the existing `summarizeBulkResult` /
`bulkResultMessage` helpers so the partial-failure copy stays consistent with
the rest of the app.

**Verify**: `npm test` → passes; `npm run typecheck` → exit 0.

### Step 4: Disable the checkbox for non-actionable rows

In `src/components/wallet/WithdrawalRequestsTable.tsx`, the row checkbox is at
lines 287-288 and currently has no `disabled` prop. Add one keyed on the row's
status, consistent with how the per-row buttons at 301/306 already gate. This
is defence in depth — step 3 is the actual control — but it stops the manager
selecting a row they cannot act on.

**Verify**: `npm test` → passes.

### Step 5: Make `run_payroll` idempotent

Create the migration:

```
npx supabase migration new payroll_run_idempotency
```

If the CLI is unavailable, hand-name with a timestamp strictly greater than any
timestamp generated by plans 004/005 — they must not collide.

Add the constraint, and **handle existing rows first**: query for duplicates
before adding a `UNIQUE`, and if any exist, STOP and report them (see STOP
conditions — do not delete real payroll records).

```sql
ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_assignment_period_uniq
  UNIQUE (assignment_id, period_start, period_end);
```

Then redefine `run_payroll` with `CREATE OR REPLACE`, copying the **full current
body** from
`supabase/migrations/20260520120446_9f0f3e62-edfa-4b9d-87f7-74d3eeb039b9.sql:307-377`
and adding an early exit at the top, before any wallet mutation:

```sql
  IF EXISTS (SELECT 1 FROM payroll_runs
              WHERE assignment_id = _assignment_id
                AND period_start = _period_start
                AND period_end = _period_end) THEN
    RAISE EXCEPTION 'Payroll already run for this assignment and period'
      USING ERRCODE = '23505';
  END IF;
```

`23505` is `unique_violation` and is the same code the client's
`guardedWrite`/`normalizeWriteError` path already special-cases (see
`src/lib/guardedWrite.ts:26`, "call sites can still branch on code/details
(e.g. 23505 unique checks)"). Use a message the UI can distinguish from a
generic failure.

Preserve `SECURITY DEFINER` and `SET search_path` on the function — see plan
005's warning about copying definer bodies. Also preserve plan 005's step-3
ordering change if you copy the body from the *current* file rather than the
original migration: the ledger INSERT must come before the balance UPDATE.

**Verify**: `grep -n "payroll_runs_assignment_period_uniq" supabase/migrations/<your-file>.sql`.

### Step 6: Surface the duplicate in the UI and drop the dead filters

In `src/pages/PayrollPage.tsx`:

- In `runPayroll` (line 253ff), before the RPC, check the already-loaded
  `payroll_runs` for a matching `(assignment, period_start, period_end)`. If one
  exists, set `setRunError('Payroll has already been run for this period.')`
  and return without calling the RPC. This is UX, not a control — step 5's
  constraint is the control.
- The `status` filter options at lines 508-512 offer `pending` and `failed`.
  `payroll_runs.status` is `NOT NULL DEFAULT 'completed'` and nothing ever writes
  another value, so those options are dead. **Remove them** and default the
  filter to `completed`, or drop the status filter entirely. Say which you chose
  in the PR.

**Verify**: `npm test` → passes; `npm run typecheck` → exit 0.

### Step 7: Contract test for the payroll constraint

Create `src/lib/__tests__/payrollRunIdempotency.test.ts`, following the
text-grep convention of `src/lib/__tests__/paymentSecurityGuards.test.ts` (see
plan 005's step 6 for the pattern). Assert:

1. The `UNIQUE (assignment_id, period_start, period_end)` constraint exists.
2. `run_payroll`'s `EXISTS` guard appears **before** the first
   `UPDATE wallets` in the function body (compare `indexOf` positions — this is
   the ordering that matters).
3. The redefined `run_payroll` still carries `SECURITY DEFINER` **and**
   `SET search_path`.
4. The `RAISE EXCEPTION` uses `ERRCODE = '23505'`.

**Verify**: `npm test -- payrollRunIdempotency` → all pass.

## Test plan

- `src/lib/__tests__/moneyGuards.test.ts` — extend with ≥10 cases per step 2.
- `src/lib/__tests__/payrollRunIdempotency.test.ts` — new, 4 assertions.
- **Verification**: `npm test` → 803 + ~14 passing, 0 failed.
- **Database verification required before merge** (the text-grep tests cannot
  prove behavior):

| Scenario | Expected |
|---|---|
| Bulk-approve a selection containing a `completed` withdrawal | row skipped, reported, wallet unchanged |
| Bulk-reject a `manager_approved` withdrawal | succeeds |
| Run payroll twice for the same assignment and period | second call raises `23505`; wallet debited once |
| Run payroll for a *different* period | succeeds |
| Approve, then finalize, a normal withdrawal | wallet debited exactly once |

The first and third rows are the acceptance tests for this plan.

## Done criteria

ALL must hold:

- [ ] `partitionWithdrawableRequests` is exported from `src/lib/moneyGuards.ts`
- [ ] The bulk update in `WalletPage.tsx` includes `.in('status', …)` with values imported from `moneyGuards`, not re-declared
- [ ] `npm test -- moneyGuards` exits 0 with ≥10 new cases
- [ ] `WithdrawalRequestsTable.tsx` row checkbox is disabled for non-actionable statuses
- [ ] `payroll_runs_assignment_period_uniq` UNIQUE constraint exists in a NEW migration
- [ ] `run_payroll`'s `EXISTS` guard precedes the first `UPDATE wallets`
- [ ] `npm test -- payrollRunIdempotency` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `git diff --name-only 08f5ec4..HEAD -- supabase/migrations/` shows only NEW files
- [ ] `git status --porcelain` shows only in-scope files
- [ ] `plans/README.md` status row for 006 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **Duplicate `(assignment_id, period_start, period_end)` rows already exist in
  `payroll_runs`.** The `UNIQUE` will fail. Do not delete real payroll records
  to make the migration pass — report the duplicates (assignment ids, periods,
  amounts; no personal data) and stop. A human must decide which run is real.
- Copying `run_payroll`'s body would require dropping `SECURITY DEFINER` or
  `SET search_path`. Report it.
- You copy `run_payroll` from the original `20260520120446` migration rather
  than from plan 005's output — that would **revert** plan 005's debit-ordering
  fix. Confirm your source body has the ledger INSERT before the balance UPDATE.
- The withdrawal status values in the label map
  (`WithdrawalRequestsTable.tsx:56-69`) do not match what you assumed, or the
  map/label mismatch (5 `map` entries vs 4 `labels`) turns out to mean a status
  exists that you have no rule for. Report the full status list rather than
  guessing a default.
- The already-loaded withdrawal list in `WalletPage` state does not carry
  `status` on every row, so you cannot partition without a new query. Report it
  — a new fetch changes the plan's shape.
- The step-5 database verification cannot be run. Say so in the PR; do not
  describe the constraint as verified.

## Maintenance notes

- **What a reviewer should scrutinise:** step 3's `.in('status', …)` — without
  it the fix is client-side only and a concurrent status change still slips
  through. And step 5's guard position, which the contract test asserts by index
  comparison.
- **This plan extends an existing pattern rather than inventing one.** If you
  find yourself writing a new bulk-result helper, stop: `moneyGuards.ts` already
  has `partitionPayoutDeliveries`, `summarizeBulkResult`, and
  `bulkResultMessage`, and the Deliveries bulk path already uses them. The
  consistency of that file is the point.
- **Adding a withdrawal status:** extend the status constant set in
  `moneyGuards.ts` and add partition cases. A new status with no partition rule
  is silently skipped — which is the safe default, but should be a decision, not
  an accident.
- **Adding a payroll dimension** (e.g. per-department periods) means revisiting
  the `UNIQUE` column list. That is expected; just do it consciously.
- **Deferred, not done here:** the label/`map` mismatch at
  `WithdrawalRequestsTable.tsx:56-69` (a `processing` withdrawal renders a raw
  lowercase word), and the `restaurants` cross-tenant read policy. Both are real
  and separate.
- **Interaction:** plan 005 redefines `process_withdrawal_completion`, which is
  the function whose transition guard makes this plan's rewind exploitable.
  Plan 005 does **not** remove that guard, so 006 is still required — but apply
  005 first, and re-verify 006's step 7 after 005 lands.
- **Migration ordering:** generate this plan's timestamp with
  `supabase migration new` at execution time. Do not reuse plan 004's or 005's.
