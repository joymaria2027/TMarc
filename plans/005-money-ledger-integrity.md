# Plan 005: Close the money-ledger integrity gaps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- supabase/migrations src/pages/WalletPage.tsx src/pages/PayrollPage.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002-verification-baseline.md
- **Category**: security
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

Four defects in the wallet/withdrawal/order ledger, each independently
exploitable or user-visible. They are grouped because they share a root cause —
**the database checks balances and money columns in the wrong place, or not at
all** — and because the verification for all four is the same: a staging
database and a set of role scenarios.

1. **The overdraft guard validates the wrong number.** `guard_wallet_debit` runs
   as a `BEFORE INSERT` on `wallet_transactions`, but the withdrawal and payroll
   paths decrement `wallets.balance` *first* and insert the ledger row second.
   The guard therefore reads the already-decremented balance, reducing the check
   to `original_balance < 2 × amount`. **Every withdrawal of more than half a
   wallet's balance fails** with "Insufficient wallet balance" — including the
   "Withdraw All" button. Legitimate cash-outs are being rejected and the
   accountant sees an unexplained failure.
2. **`withdrawal_requests.amount` has no `CHECK (amount > 0)`**, and the insert
   policy checks only wallet ownership. A negative amount turns the completion
   trigger into a **wallet mint** — the balance increases. The platform's own
   `withdrawal_overdraft` fraud check only fires on `balance < 0`, so a mint is
   invisible to it.
3. **`wallets.balance` is directly writable** by any accountant or admin
   session, with no `wallet_transactions` row. Funds can be created or
   destroyed by a single PostgREST update. The repo's own `fraud_audit_report`
   classifies balance-vs-ledger divergence as **critical** — but only reports it
   after the fact.
4. **`submit_order` never validates `orders.total`.** Its guard checks only
   `subtotal` against `SUM(line_total)`, while the code comment claims it
   "catches a rewritten order.total". Meanwhile `orders_merchant_update` is an
   unrestricted column `FOR UPDATE` for merchant managers, and
   `credit_merchant_for_order` credits `ROUND(o.subtotal, 2)` — "delivery fee
   excluded". So a merchant manager can set `total = 1` on a pending order; the
   customer is charged D1 through the genuine ModemPay flow; the webhook
   verifies against the tampered `total` and passes; the merchant wallet is
   credited the full untampered subtotal.

## Current state

### 1. The debit ordering defect

`supabase/migrations/20260527053100_813926ae-3a9a-46a8-942c-859edebbc43a.sql:61-78`:

```sql
CREATE OR REPLACE FUNCTION public.guard_wallet_debit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE bal numeric;
BEGIN
  IF NEW.type = 'debit' THEN
    SELECT balance INTO bal FROM wallets WHERE id = NEW.wallet_id FOR UPDATE;
    IF bal IS NULL THEN RAISE EXCEPTION 'Wallet % not found', NEW.wallet_id; END IF;
    IF bal < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance (have %, need %)', bal, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
```

attached at lines 74-78 as `BEFORE INSERT ON public.wallet_transactions`.

The two callers that debit a wallet both decrement **before** inserting:

`supabase/migrations/20260520092149_f00bedad-d7a5-40e4-aeaa-50e65fe6c3bd.sql:210-216`
(inside `process_withdrawal_completion`, the latest definition — this function is
redefined in 7 migrations and this is the last one):

```sql
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE wallets SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;

    INSERT INTO wallet_transactions (wallet_id, type, amount, description, withdrawal_request_id)
    VALUES (NEW.wallet_id, 'debit', NEW.amount,
      'Withdrawal via ' || COALESCE(NEW.payout_method, 'N/A'), NEW.id);
```

`supabase/migrations/20260520120446_9f0f3e62-edfa-4b9d-87f7-74d3eeb039b9.sql:361-365`
(inside `run_payroll`) has the identical ordering.

**Correction to a common misreading:** these paths *do* write the
`wallet_transactions` debit row — do not "fix" a missing ledger row that does not
exist. The defect is purely the ordering, which makes the existing guard
validate `balance_after < amount` instead of `balance_before < amount`.

### 2. The missing amount constraint

`supabase/migrations/20260414085352_16355f1b-a6e0-4694-bce7-351179768635.sql:46`:

```sql
  amount NUMERIC NOT NULL,
```

No `CHECK`, no upper bound. Confirmed absent across all 110 migrations. The
insert policy (`supabase/migrations/20260609072253_62589aaa-….sql:68-83`) checks
`requested_by` and wallet ownership but not `amount`. The only bound is
client-side, at `src/pages/WalletPage.tsx:270` (`validateWithdrawal`).

The fraud check that would need to catch a mint —
`supabase/migrations/20260920000003_delivered_no_proof_fraud_check.sql:103-106`:

```sql
    WHERE wr.status='completed' AND w.balance < 0 LIMIT 20
```

A negative amount makes the balance *positive*, so this never fires.

### 3. The writable balance

`supabase/migrations/20260414085352_16355f1b-a6e0-4694-bce7-351179768635.sql:28-32`:

```sql
CREATE POLICY "Admins can update wallets" ON public.wallets FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can update wallets" ON public.wallets FOR UPDATE
  USING (has_role(auth.uid(), 'accountant'::app_role));
```

No column list, no `WITH CHECK`. `guard_wallet_debit` is on
`wallet_transactions`, not on `wallets`, so it never sees this write. No client
code path writes `wallets` directly — all credits flow through triggers and
functions — so this grant is currently unused surface.

### 4. The unvalidated order total

`supabase/migrations/20260918093000_payment_security_hardening.sql:96-101`:

```sql
  -- Totals must equal the sum of line totals (catches a rewritten order.total).
  IF ABS(COALESCE(o.subtotal, 0) - (
       SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = _order_id
     )) > 0.009 THEN
    RAISE EXCEPTION 'Order price data is stale or tampered';
  END IF;
```

The comment says `order.total`; the code checks `subtotal`. `total` and
`delivery_fee` are never cross-checked.

`supabase/migrations/20260608100847_51184abd-4260-4d51-97f6-b021902c36ce.sql:135-137`:

```sql
CREATE POLICY "orders_merchant_update" ON public.orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));
```

A merchant manager owns the row and may write every column, including `total`.

And the crediting basis — `supabase/migrations/20260908082154_…`:

```sql
  amt := ROUND(COALESCE(o.subtotal,0), 2);
  IF amt <= 0 THEN RETURN 'zero_amount'; END IF;
```

with the description string noting `'(goods subtotal, delivery fee excluded)'`.

## Design — what to change and what NOT to

- **Fix the ordering, do not remove the guard.** Swapping the two statements in
  each function makes `guard_wallet_debit` validate the real available balance,
  and leaves it as the single source of truth for overdraft rejection. Do not
  delete `guard_wallet_debit` and add ad-hoc balance checks — that would give
  you two divergent overdraft rules.
- **Do not** add a blanket `REVOKE UPDATE ON wallets`. Column-level privilege
  cannot express "adjustments must be audited", and revoking outright may break
  a legitimate admin correction path you have not found. Instead add a
  `BEFORE UPDATE OF balance` guard trigger that requires a `wallet_transactions`
  row to exist for the change — the same trigger-plus-ledger pairing as
  `deliveries` in plan 004.
- **Adding a `CHECK` to a table with existing rows** will fail if any historical
  row violates it. Query for offenders first (step 2) and handle them
  explicitly; do not disable the constraint to get the migration through.
- **The `orders.total` fix is additive** — one more assertion inside an
  already-fail-closed function. It rejects nothing legitimate, because a correct
  order always satisfies `total = subtotal + delivery_fee`.

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Tests     | `npm test`                             | 803+ passed, 0 failed |
| Typecheck | `npm run typecheck`                    | exit 0 |
| SQL sanity| `grep -c "CREATE TRIGGER" supabase/migrations/<your-file>.sql` | 1 |
| DB (opt.) | `npx supabase status`                  | reports a local instance, or says none |

## Scope

**In scope**:
- `supabase/migrations/<new>_money_ledger_integrity.sql` (create — all four fixes, one migration, because they are one reviewable unit)
- `supabase/migrations/<new>_money_ledger_integrity.sql` may be split into two files if you prefer; if you do, generate both timestamps with `supabase migration new` and note the order.
- `src/lib/__tests__/moneyLedgerGuards.test.ts` (create)

**Out of scope** (do NOT touch):
- Any **existing** migration. They are immutable once applied.
- `supabase/migrations/20260527053100_…` — defines `guard_wallet_debit`. Read it;
  do not edit. Your fix goes in the callers.
- `src/pages/WalletPage.tsx`, `src/pages/PayrollPage.tsx` — the client bounds are
  correct; only the database is wrong. If you think a client change is needed,
  stop.
- `supabase/functions/**` — the webhook is plan 003.
- `supabase/migrations/20260918093000_…` — already applied; add a new migration
  rather than editing `submit_order` in place. Redefine the function in your new
  migration with `CREATE OR REPLACE`.
- Plan 004's settlement-column guard, plan 006's double-debit paths, plan 007's
  checkout race.
- The `SECURITY DEFINER` `PUBLIC` grant surface (a separate, broader plan).

## Git workflow

- Branch: `advisor/005-money-ledger-integrity`
- Conventional Commits, matching observed repo style (e.g.
  `fix(finance): gate settlement approval behind proof confirm`):
  - `fix(finance): validate balance before wallet debit, constrain withdrawal amount`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the migration

```
npx supabase migration new money_ledger_integrity
```

If the CLI is unavailable, hand-name with a timestamp strictly greater than
`20260921000004` and note it in the PR. Do not reuse another plan's timestamp.

### Step 2: Add `CHECK (amount > 0)` — but audit existing rows first

**Before** writing the constraint, check for existing violations. Run against a
database:

```sql
SELECT id, amount, status FROM public.withdrawal_requests
 WHERE amount <= 0 ORDER BY created_at;
```

If that returns rows, **STOP and report them** (see STOP conditions) — do not
delete or adjust real financial records to make a migration pass. That is a
reconciliation decision for a human.

If it returns nothing, add:

```sql
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_amount_positive CHECK (amount > 0);
```

Note this also blocks zero-amount requests. Confirm zero-amount withdrawals are
not a legitimate case in this product (read `src/pages/WalletPage.tsx:270`'s
`validateWithdrawal` for the intended client-side rule and match it).

**Verify**: `grep -n "withdrawal_requests_amount_positive" supabase/migrations/<your-file>.sql`.

### Step 3: Fix the debit ordering in both callers

Redefine both functions in your migration with the ledger insert **before** the
balance update.

`process_withdrawal_completion` — copy the **full current body** from
`supabase/migrations/20260520092149_f00bedad-d7a5-40e4-aeaa-50e65fe6c3bd.sql:184`
(the latest of its 7 definitions — read it, do not reconstruct it from this
plan) and change only the ordering inside the
`NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'` branch:

```sql
    -- Insert the ledger row FIRST so guard_wallet_debit (BEFORE INSERT) reads
    -- the pre-debit balance. Reversing this silently reduces the check to
    -- `balance < 2 * amount` and rejects every withdrawal over half the balance.
    INSERT INTO wallet_transactions (wallet_id, type, amount, description, withdrawal_request_id)
    VALUES (NEW.wallet_id, 'debit', NEW.amount,
      'Withdrawal via ' || COALESCE(NEW.payout_method, 'N/A'), NEW.id);

    UPDATE wallets SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;
```

`run_payroll` — same swap in
`supabase/migrations/20260520120446_9f0f3e62-edfa-4b9d-87f7-74d3eeb039b9.sql:361-365`,
inside the `IF payer_w IS NOT NULL THEN` block. Leave the payee credit alone —
it is a `credit`, which the guard ignores.

Both functions are `SECURITY DEFINER`; **preserve that clause and the
`SET search_path TO 'public'`** on each. Dropping `search_path` on a definer
function is a security regression, and dropping `SECURITY DEFINER` breaks their
ability to write tables the caller cannot.

**Verify**: in your new migration, the `INSERT INTO wallet_transactions` line for
the withdrawal must appear **before** the `UPDATE wallets SET balance = balance -`
line. Check with `grep -n`.

### Step 4: Guard `wallets.balance` against unledgered writes

Add a trigger that rejects a `balance` change that is not accompanied by a
`wallet_transactions` row:

```sql
CREATE OR REPLACE FUNCTION public.guard_wallet_balance_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    -- A balance change is only legitimate as part of a ledger entry. Triggers
    -- like credit_wallets_on_settlement and process_withdrawal_completion
    -- insert wallet_transactions in the same transaction, so they pass.
    IF NOT EXISTS (
      SELECT 1 FROM wallet_transactions wt
       WHERE wt.wallet_id = NEW.id
         AND wt.created_at >= OLD.updated_at
    ) THEN
      RAISE EXCEPTION
        'Wallet balance must be changed together with a wallet_transactions row'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_wallet_balance_ledger
  BEFORE UPDATE OF balance ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.guard_wallet_balance_ledger();
```

> **This trigger shape needs validation against a real database before you
> trust it.** The `created_at >= OLD.updated_at` heuristic is a *starting point*,
> not a proven-correct predicate — it depends on how the existing triggers order
> their `wallet_transactions` insert relative to the `wallets` update, and on
> whether `wallets.updated_at` is reliably bumped. Read
> `credit_wallets_on_settlement` and `process_withdrawal_completion` and confirm
> the ordering. If the existing triggers update `wallets` *after* inserting the
> ledger row (which is what step 3 establishes for the debit path), a simpler and
> more robust predicate is to check for a ledger row in the same transaction via
> a transaction-local marker, or to move the balance enforcement entirely into a
> definer function. **If you cannot establish a correct predicate, that is a STOP
> condition** — a trigger that false-positives on legitimate settlement credits
> would halt the core business flow, which is worse than the hole it closes.

**Verify**: `grep -c "CREATE TRIGGER" supabase/migrations/<your-file>.sql` → `1`.

### Step 5: Validate `orders.total` in `submit_order`

Redefine `submit_order` in your migration with `CREATE OR REPLACE`, copying the
**full current body** from
`supabase/migrations/20260918093000_payment_security_hardening.sql` and adding
one assertion immediately after the existing `subtotal` guard (lines 96-101):

```sql
  -- NEW: the payable total must equal subtotal + delivery_fee. Without this a
  -- merchant manager can rewrite `total` (orders_merchant_update is an
  -- unrestricted column UPDATE) and have the customer charged a token amount
  -- while credit_merchant_for_order still credits the full subtotal.
  IF ABS(COALESCE(o.total, 0)
       - (COALESCE(o.subtotal, 0) + COALESCE(o.delivery_fee, 0))) > 0.009 THEN
    RAISE EXCEPTION 'Order total does not match subtotal plus delivery fee';
  END IF;
```

Keep the existing `subtotal` guard and the comment above it. Also fix the
misleading comment on line 96 — it claims to catch a rewritten `order.total`,
which it does not; after your change both are true, so reword it to say so.

**Verify**: `grep -c "does not match subtotal plus delivery fee" supabase/migrations/<your-file>.sql` → `1`.

### Step 6: Write the contract test

Create `src/lib/__tests__/moneyLedgerGuards.test.ts`, following the text-grep
convention used by `src/lib/__tests__/paymentSecurityGuards.test.ts` and
`modempayWebhookDedup.test.ts` (a `read()` helper over `fs.readFileSync`, then
`describe`/`it`). State plainly in the header comment that this is a
change-detector, not an executed contract.

Assertions, one group per fix:
1. **Ordering** — in your migration, for both the withdrawal and the payroll
   debit, `indexOf("INSERT INTO wallet_transactions")` is less than
   `indexOf("UPDATE wallets SET balance = balance -")`. This is the regression
   guard that matters most; assert it by comparing positions, not by `toContain`.
2. **Constraint** — `withdrawal_requests_amount_positive` exists with
   `amount > 0`.
3. **Balance guard** — the trigger exists and the `RAISE EXCEPTION` carries
   `ERRCODE = '42501'`.
4. **Order total** — the new assertion exists in the redefined `submit_order`,
   and the original `subtotal` guard is still present.
5. **Preserved security clauses** — every `CREATE OR REPLACE FUNCTION` in your
   migration that is `SECURITY DEFINER` also carries `SET search_path`. Assert
   the count of `SECURITY DEFINER` equals the count of `SET search_path` in your
   file. This catches accidentally dropping `search_path` while copying a body.

**Verify**: `npm test -- moneyLedgerGuards` → all pass.

### Step 7: Verify against a database

The text-grep test cannot prove any of this works. With a real database, confirm:

| Scenario | Expected |
|---|---|
| Withdraw an amount ≤ half the balance | succeeds, balance and ledger agree |
| Withdraw an amount > half the balance (e.g. "Withdraw All") | succeeds — **this is the regression this plan fixes; today it fails** |
| Withdraw more than the full balance | `Insufficient wallet balance` |
| Insert a `withdrawal_requests` row with `amount = -50` | rejected by the CHECK |
| Accountant updates `wallets.balance` directly with no ledger row | rejected, `42501` |
| Normal settlement credit fires | succeeds (trigger does not false-positive) |
| Merchant manager sets `total = 1` on a pending order, customer pays | `submit_order` raises; merchant is not credited |

The second and sixth rows are the two that matter most — they are what the
defect and the guard are respectively about.

If you have no database available, say so explicitly in the PR. Do not describe
these as verified when they are not.

## Test plan

- New file: `src/lib/__tests__/moneyLedgerGuards.test.ts`, 5 assertion groups.
- **Verification**: `npm test` → 803+ passing, 0 failed.
- Manual DB verification per step 7 is **required before merge**; the two
  highlighted scenarios are the acceptance tests.

## Done criteria

ALL must hold:

- [ ] A new migration exists, timestamp greater than `20260921000004`
- [ ] `git diff --name-only 08f5ec4..HEAD -- supabase/migrations/` shows only NEW files
- [ ] `withdrawal_requests_amount_positive` CHECK present
- [ ] For both debit paths, the ledger INSERT precedes the balance UPDATE in your migration
- [ ] `trg_guard_wallet_balance_ledger` present with `ERRCODE = '42501'`
- [ ] The `orders.total` assertion is present in the redefined `submit_order`, and the `subtotal` guard survives
- [ ] Count of `SECURITY DEFINER` in your migration equals count of `SET search_path`
- [ ] `npm test -- moneyLedgerGuards` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0
- [ ] `git status --porcelain` shows only in-scope files
- [ ] `plans/README.md` status row for 005 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **`SELECT id, amount, status FROM withdrawal_requests WHERE amount <= 0`
  returns any rows.** Real financial records violate the new constraint. Do not
  delete or edit them — a human must reconcile. Report the rows (ids and
  amounts only, no customer PII) and stop.
- You cannot establish a **correct** predicate for the `wallets.balance` guard
  (step 4). A trigger that false-positives on legitimate settlement credits
  halts the core business flow. An unproven predicate here is worse than the
  hole — report instead.
- Zero-amount withdrawal requests appear to be a legitimate product case. The
  CHECK as written blocks them; report the tension rather than weakening the
  constraint on your own judgement.
- `credit_wallets_on_settlement` or another credit path updates `wallets` in a
  way that would trip your balance guard. Enumerate the callers first (grep for
  `UPDATE wallets SET balance`) and report what you find.
- Copying a function body requires changing its `SECURITY DEFINER` or
  `search_path` clauses. That means the original has a problem — report it, do
  not fix it in passing.
- Applying the migration would require a manual SQL paste because of the known
  migration-history drift. Do **not** run `supabase migration repair` against a
  live database here. Leave the migration unapplied and say so.
- Any fix appears to require a client change in `WalletPage.tsx` or
  `PayrollPage.tsx`.

## Maintenance notes

- **What a reviewer should scrutinise:** step 3's ordering (compare line
  positions in the diff — it is a two-line move that is easy to miss in review
  and catastrophic to omit) and step 4's predicate (the weakest part of this
  plan; see its STOP condition).
- **Adding a new wallet-mutating path:** any new function that changes
  `wallets.balance` must insert a `wallet_transactions` row in the same
  transaction, or step 4's guard will reject it. Say this in the migration
  header.
- **Adding a new money column to `orders`:** extend the step-5 assertion. The
  lesson from this plan is that a guard whose comment overstates what it checks
  is worse than no guard — it reads as protection that isn't there.
- **Deployment note for the human who owns this.** The step-2 constraint and the
  step-3 ordering change both alter live financial behavior. The ordering fix
  makes withdrawals *succeed* that currently fail — expect a small increase in
  successful withdrawals immediately after deploy, and confirm it is legitimate
  activity rather than a flood. Run the fraud report before and after.
- **Interaction:** plans 004, 006, and 007 each generate their own migration
  timestamp. Apply all four **in timestamp order**, and generate each timestamp
  at execution time — do not reuse one.
- **Not done here:** the `PUBLIC` EXECUTE grants on 20+ `SECURITY DEFINER`
  functions (including `run_payroll` itself), the `withdrawal_pin` client-side
  verification, the `receipts` bucket, and the double-debit paths in plan 006.
  This plan is scoped to balance/amount integrity so it can be reviewed and
  applied as one unit.
