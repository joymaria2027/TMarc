# Plan 004: Block Riders from writing settlement and tariff columns

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- supabase/migrations src/pages/RiderDashboard.tsx src/pages/SettlementsPage.tsx src/components/ReceiptUpload.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/002-verification-baseline.md
- **Category**: security
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

A Rider can currently mint money. The `deliveries` table's Rider UPDATE policy
is blanket — no column restriction, no `WITH CHECK` — and a trigger chain
credits real wallet balances the moment `settlement_approved` flips from false
to true. A Rider session can issue two PostgREST updates on its own Delivery:
set `actual_tariff` to an arbitrary figure, then set `settlement_approved =
true`. The trigger credits the Rider, Merchant, platform, and UCS Rides wallets
from that inflated tariff, and `guard_settlement_reset` then forbids undoing it
(`uniq_wallet_credit_per_delivery` limits it to one credit per Delivery, so it
is one inflated settlement, not unlimited — but one is enough).

The app never writes those columns as a Rider, so the UI is not the gate — RLS
is the only control, and it currently permits it. This is the highest-impact
finding in the audit.

Risk is HIGH because the fix must not break the legitimate Rider write path
(status transitions, odometer photos, receipts) or the automatic settlement
trigger. Read "Design" below before writing any SQL.

## Current state

### The permissive policy

`supabase/migrations/20260412122346_0fe944b7-b9e4-4034-a068-f42023e0122c.sql:225-227`:

```sql
CREATE POLICY "Riders can update own deliveries" ON public.deliveries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.riders WHERE riders.id = deliveries.rider_id AND riders.user_id = auth.uid())
);
```

No `WITH CHECK`, no column list. A `USING`-only `FOR UPDATE` policy also means
Postgres re-checks it as a `USING` for the new row, but that does not restrict
*which columns* may change.

Across all 110 migrations there is exactly **one** column-scoped privilege
revoke, and it is on a different table — `supabase/migrations/20260612065300_97c6fa1d-bdee-4ff0-8618-fbf8ad738eb2.sql:31`:

```sql
REVOKE UPDATE (withdrawal_pin) ON public.profiles FROM authenticated;
```

So the pattern exists in this repo, but nothing constrains `deliveries`.

### The credit chain that makes it money

- `supabase/migrations/20260414085352_16355f1b-a6e0-4694-bce7-351179768635.sql:133-135`
  — `credit_wallets_trigger` (SECURITY DEFINER) fires when `settlement_approved`
  goes false→true and credits the Rider/Merchant/platform wallets.
- `supabase/migrations/20260520120446_9f0f3e62-edfa-4b9d-87f7-74d3eeb039b9.sql:79`
  — `tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0)`.
  This is the attacker-controlled number.
- `supabase/migrations/20260527053100_813926ae-3a9a-46a8-942c-859edebbc43a.sql:46-58`
  — `guard_settlement_reset` blocks only true→false, so an inflated credit is
  permanent.
- Three automatic approval paths set the flag, so it is not only a human
  action: `supabase/migrations/20260920000005_settlement_dual_mode.sql:117,172,271`.

### Exactly which columns a Rider legitimately writes

Enumerate these yourself before writing the guard — this list is the contract
the fix must preserve. From the current client code:

| Site | Columns written |
|---|---|
| `src/pages/RiderDashboard.tsx:320` | `status` |
| `src/pages/RiderDashboard.tsx:536-541` | `status`, `picked_up_at`, `start_odometer_miles`, `start_odometer_photo_url`, `start_odometer_at` |
| `src/pages/RiderDashboard.tsx:572-578` | `status`, `delivered_at`, `actual_distance_km`, `gps_confirmed`, `end_odometer_miles`, `end_odometer_photo_url`, `end_odometer_at` |
| `src/pages/RiderDashboard.tsx:599-600` | `status`, `delivered_at`, `gps_confirmed` |
| `src/components/ReceiptUpload.tsx:68` | `receipt_attached` |

Staff write the privileged columns:

| Site | Columns written |
|---|---|
| `src/pages/SettlementsPage.tsx:395-398, 439-442, 515-518` | `settlement_approved`, `settlement_approved_by` |

The client-side approval gate is `src/pages/SettlementsPage.tsx:629`:

```tsx
const canApprove = hasRole('accountant') || hasRole('company_manager') || hasRole('admin');
```

**Read `src/lib/rolePermissions.helpers.ts` to get the exact role strings**
rather than assuming — `company_manager` is used in the client, and the SQL
`has_role` calls in existing policies use strings like `'accountant'`,
`'admin'`, `'business_owner'`. Confirm the full set before hardcoding.

## Design — read this before writing SQL

**Do NOT use a blanket `REVOKE UPDATE (settlement_approved, …) ON deliveries
FROM authenticated`.** It appears to be the tighter fix and it is wrong: the
legitimate settlement approval at `src/pages/SettlementsPage.tsx:395` is a
**direct client-side `.update()` from an accountant or company manager's
browser session**, not a call through a definer function. A column revoke from
`authenticated` would break settlement approval for every staff member — a
production outage on the feature the business runs on.

The correct instrument is a `BEFORE UPDATE` trigger that inspects the *writing
role* and raises for anyone who is neither staff nor the system. This is the
one place where a trigger beats a policy, because Postgres `REVOKE` cannot
express "this role may write these columns but not those".

Two role classes must be allowed through:

1. **Staff** — `has_role(auth.uid(), <accountant|company_manager|admin|…>)`,
   matching the client gate at `SettlementsPage.tsx:629`.
2. **The system** — `auto_settle_delivery` is declared
   `SECURITY DEFINER` (`supabase/migrations/20260920000005_settlement_dual_mode.sql`,
   verified) and issues its own write at lines 116-119:

   ```sql
   UPDATE public.deliveries
      SET settlement_approved = true,
          settlement_source = 'auto',
          settlement_approved_by = NULL
    WHERE id = NEW.id;
   ```

   Because it is `SECURITY DEFINER`, that write executes as the function
   owner, **not** as the Rider whose UPDATE triggered it. A trigger guard
   keyed on `current_user` therefore correctly lets it through — this is the
   property that makes the design safe. Verify the `SECURITY DEFINER` clause
   yourself before relying on it (see STOP conditions).

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Tests     | `npm test`                           | 803+ passed, 0 failed |
| Typecheck | `npm run typecheck`                  | exit 0 |
| Lint      | `npx eslint src/pages/RiderDashboard.tsx` | no new errors |
| SQL sanity| `grep -c "CREATE TRIGGER" supabase/migrations/<your-file>.sql` | 1 |

**This plan writes a SQL migration but cannot apply it.** There is no local
Supabase instance in this environment and `supabase db push` is known-blocked
by a pre-existing ~76-row local/remote migration-history drift (recorded in
`.scratch/audit-remediation/issues/03-edge-function-payment-holes.md:30-33`;
15 of 110 migrations were already applied out-of-band). See "Deployment" below.

## Scope

**In scope** (the only files you should modify):
- `supabase/migrations/<new-timestamp>_guard_delivery_settlement_columns.sql` (create)
- `src/lib/__tests__/deliverySettlementColumnGuard.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):
- Any **existing** file in `supabase/migrations/`. Migrations are immutable once
  applied; add a new one. `20260412122346_…` defines the permissive policy —
  read it, do not edit it.
- `src/pages/SettlementsPage.tsx`, `src/pages/RiderDashboard.tsx`,
  `src/components/ReceiptUpload.tsx` — **no client change is needed.** The
  client's current behavior is already correct; only the database is wrong.
  If you find yourself editing these, you have misunderstood the fix.
- `supabase/migrations/20260920000005_settlement_dual_mode.sql` — the auto-settle
  trigger must keep working unchanged.
- The other SECURITY DEFINER grant gaps (plan 005) and money-ledger issues
  (plans 005-007).
- `src/pages/AdminDashboard.tsx`, `src/pages/MerchantsPage.tsx`,
  `src/pages/ProductApprovalsPage.tsx` — plan 001 owns those.

## Git workflow

- Branch: `advisor/004-guard-settlement-columns`
- Conventional Commits, matching observed repo style (e.g.
  `fix(rls): restrict RLS Verification nav + page guard to admin/dev`):
  - `fix(rls): block riders from writing settlement and tariff columns`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the migration with `supabase migration new`

Generate the filename with the CLI so the timestamp is unique and correctly
ordered — several hand-named migrations in this repo already collided, and
`supabase/migrations/20260921000004_allow_enroute_order_status.sql` exists
purely because of a prior version collision (commit `c8231ca`).

```
npx supabase migration new guard_delivery_settlement_columns
```

If the CLI is unavailable, name it by hand with a timestamp **strictly greater
than `20260921000004`** and record in the PR that it was hand-named.

### Step 2: Write the guard trigger

In the new migration, define a `BEFORE UPDATE` trigger restricted to the
privileged columns:

```sql
CREATE OR REPLACE FUNCTION public.guard_delivery_settlement_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only the privileged columns are guarded; everything else a Rider writes
  -- (status, odometer, receipts) is unaffected.
  IF NEW.settlement_approved IS DISTINCT FROM OLD.settlement_approved
     OR NEW.settlement_approved_by IS DISTINCT FROM OLD.settlement_approved_by
     OR NEW.settlement_source     IS DISTINCT FROM OLD.settlement_source
     OR NEW.actual_tariff        IS DISTINCT FROM OLD.actual_tariff
     OR NEW.estimated_tariff     IS DISTINCT FROM OLD.estimated_tariff
  THEN
    -- SECURITY DEFINER callers (e.g. auto_settle_delivery) run as the owner.
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      IF NOT (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'accountant')
        OR public.has_role(auth.uid(), 'company_manager')
      ) THEN
        RAISE EXCEPTION
          'Only settlement-privileged roles may modify settlement or tariff columns'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_delivery_settlement_columns
  BEFORE UPDATE OF settlement_approved, settlement_approved_by,
                     settlement_source, actual_tariff, estimated_tariff
  ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_settlement_columns();
```

Notes on the shape:
- The `BEFORE UPDATE OF <columns>` list means the trigger body only runs when one
  of those columns is *named in the SET clause*. A Rider updating only `status`
  never enters the body at all — zero overhead on the hot path, and no risk of
  a false rejection.
- The `IS DISTINCT FROM` comparisons (not `<>`) are deliberate: they are
  null-safe, so a Rider writing `settlement_approved = NULL` is caught, and a
  staff member re-writing the same value is not.
- `ERRCODE = '42501'` is `insufficient_privilege`, so the failure surfaces as a
  permission error rather than a generic one.
- Confirm the role strings against `src/lib/rolePermissions.helpers.ts` and
  against existing `has_role` calls in the migrations (e.g.
  `20260412122346:22-32` defines `has_role`; `20260608100847` uses
  `'business_owner'`). If `company_manager` is not a real role string in the
  database, use the real one and say which in a comment.
- Keep the existing `"Riders can update own deliveries"` policy in place. It is
  correct for the columns Riders *should* write; the trigger is the additional
  guard, and removing the policy would break the Rider flow.
- Do not add `REVOKE` (see Design).

**Verify**: `grep -c "CREATE TRIGGER" supabase/migrations/<your-file>.sql` → `1`.
`grep -c "has_role" supabase/migrations/<your-file>.sql` → `3`.

### Step 3: Write the contract test

Create `src/lib/__tests__/deliverySettlementColumnGuard.test.ts`.

Because this repo has no database in CI, the established convention for
SQL-boundary guards is a text-grep contract test over the migration file. Model
it on `src/lib/__tests__/paymentSecurityGuards.test.ts` and
`src/lib/__tests__/modempayWebhookDedup.test.ts` — both use a `read()` helper
over `fs.readFileSync` and assert on source text. Be honest in the file's header
comment that this is a change-detector, not an executed contract.

Assertions:
1. A `BEFORE UPDATE OF` trigger exists naming all five privileged columns.
2. The guard function raises for a non-privileged writer (an `ERRCODE = '42501'`
   `RAISE EXCEPTION` is present).
3. The staff allowlist is present and includes the roles named in
   `SettlementsPage.tsx:629`.
4. **Regression guard:** assert the new migration does **not** contain
   `REVOKE UPDATE` on `public.deliveries` — a future edit reintroducing the
   blanket revoke would break settlement approval, and this assertion is what
   catches it.
5. **Regression guard:** assert the existing Rider policy in
   `20260412122346_…` is still present (it should be untouched; this guards
   against someone "cleaning it up" and breaking the Rider flow).

Note the migration filename is a timestamp you generate in step 1 — glob for it
rather than hardcoding, e.g. read the newest
`supabase/migrations/*_guard_delivery_settlement_columns.sql`.

**Verify**: `npm test -- deliverySettlementColumnGuard` → all pass.

### Step 4: Manual verification against a real database

The text-grep test cannot prove the trigger works. If you have a Supabase
instance available (`npx supabase status`), apply the migration and verify with
four role scenarios. If you do **not** have one, say so explicitly in the PR
description — do not claim the trigger is verified when it is not.

| Scenario | Expected |
|---|---|
| Rider updates `status` on own Delivery | succeeds |
| Rider updates `settlement_approved` on own Delivery | `42501 insufficient_privilege` |
| Rider updates `actual_tariff` on own Delivery | `42501 insufficient_privilege` |
| Accountant updates `settlement_approved` | succeeds, wallets credited |
| Delivery transitions to `delivered` with a valid `revenue_sharing` row, auto mode | auto-settles, wallets credited |

The last row is the important one — it proves the `SECURITY DEFINER` path
still works through your new trigger.

## Test plan

- New file: `src/lib/__tests__/deliverySettlementColumnGuard.test.ts`, 5
  assertions as above.
- **Verification**: `npm test` → 803+ passing, 0 failed.
- Manual DB verification per step 4 is **required** before this ships; record
  the result in the PR.

## Done criteria

ALL must hold:

- [ ] A new migration exists with a filename timestamp greater than `20260921000004`
- [ ] `grep -c "REVOKE" supabase/migrations/<your-file>.sql` returns `0`
- [ ] `grep -c "CREATE TRIGGER" supabase/migrations/<your-file>.sql` returns `1`
- [ ] `npm test -- deliverySettlementColumnGuard` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `git diff --name-only 08f5ec4..HEAD -- supabase/migrations/` shows only NEW files — no existing migration modified
- [ ] `git diff --name-only 08f5ec4..HEAD -- src/` shows no changes to `RiderDashboard.tsx`, `SettlementsPage.tsx`, or `ReceiptUpload.tsx`
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **`auto_settle_delivery` is not `SECURITY DEFINER`.** Re-read
  `supabase/migrations/20260920000005_settlement_dual_mode.sql`. If the clause
  was removed, the trigger's internal `UPDATE` runs as the invoking Rider, your
  `current_user` check will reject it, and **auto-settlement breaks silently**.
  That is a materially different design problem — report it rather than
  improvising a workaround.
- You cannot determine the real role-name strings from
  `src/lib/rolePermissions.helpers.ts` and the migrations. Guessing a role
  string means either locking out legitimate staff or letting a role through.
- `npx supabase migration new` produces a filename that collides with an
  existing migration. Report it — a collision is how
  `20260921000004_allow_enroute_order_status.sql` came to exist.
- Applying the migration requires a manual SQL paste because of the known
  migration-history drift. Do **not** attempt `supabase migration repair`
  against a live database here — that is a separate, HIGH-risk plan. Report it
  and leave the migration unapplied.
- Any fix appears to require a client change in `RiderDashboard.tsx` or
  `SettlementsPage.tsx`. It should not. If it seems to, the trigger is wrong.
- The `BEFORE UPDATE OF` column list would need to include a column a Rider
  legitimately writes. That means the column lists above are stale — report it.

## Maintenance notes

- **What a reviewer should scrutinise:** the role-string list, and the
  `current_user IN (...)` allowlist. Both are the difference between "Riders
  can't mint money" and "settlement approval is broken". Cross-check the
  strings against `rolePermissions.helpers.ts` rather than trusting the plan.
- **Adding a new settlement-privileged column:** anyone adding a money column to
  `deliveries` must add it to the trigger's `BEFORE UPDATE OF` list and to the
  `IS DISTINCT FROM` chain. Say this in the migration's header comment. This is
  the main way the guard can silently fall out of date.
- **Adding a new privileged *role*:** same — extend the `has_role` chain. The
  client gate at `SettlementsPage.tsx:629` and the SQL allowlist must agree;
  if they drift, staff either cannot approve or the button is a lie.
- **Deployment note for the human who owns this.** This migration is
  un-applied. Applying it to production is the whole point of the plan and
  cannot be done from this environment. Before applying, confirm on a staging
  database that the five scenarios in step 4 behave as tabulated — especially
  auto-settlement. After applying, the fraud report
  (`fraud_audit_report`, see `20260527053100:138-151`) should be re-run to see
  whether any *pre-existing* inflated settlements were already credited by this
  bug; if so, that is a separate reconciliation task, not part of this plan.
- **Interaction:** plans 005, 006, and 007 each add their own migration. They
  must be **applied in filename-timestamp order**, and each must generate its
  timestamp at execution time via `supabase migration new` — not reuse a
  timestamp from this plan.
- **Not done here:** the `wallets.balance` direct-write hole and the
  `withdrawal_requests.amount` missing CHECK (both money-ledger issues, plan
  005). This plan is deliberately scoped to the `deliveries` settlement columns
  only, so it can be reviewed and applied on its own.
