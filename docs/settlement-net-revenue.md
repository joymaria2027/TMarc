# Rider net income on settlement

Prose description of the net-income formula in the settlement trigger, so the
money math is readable without opening PL/pgSQL.

**The SQL is the ledger.** This file is a description of it and can drift from
it. When they disagree, the SQL is correct and this file is a bug.

- **Authoritative source:**
  `supabase/migrations/20260520120446_9f0f3e62-edfa-4b9d-87f7-74d3eeb039b9.sql`
  — `CREATE OR REPLACE FUNCTION public.credit_wallets_on_settlement()`
- **Formula line:** that file, `net_income := GREATEST(...)`
- **Superseded:** `20260520114655_b65a2fd9-…sql` is the same function before
  amortization existed. Its `total_deductions` was `fuel_cost + other_expenses`
  — two terms, no amortization. `20260520120446` replaced it with four. If you
  are reading an older note that describes two deductions, it is out of date.

Later migrations (`20260920000005`, `20261002104213`, `20261002120201`) reference
this function but do not change the arithmetic; they only change who approves and
who may write `wallets.balance`.

## 1. Resolve miles

First rule that matches wins:

1. Odometer: `end_odometer_miles - start_odometer_miles`, but only when both
   are non-null **and** `end >= start`. A decreasing odometer is ignored rather
   than producing negative miles.
2. `actual_distance_km * 0.621371`
3. `estimated_distance_km * 0.621371`
4. `0`

## 2. Fuel cost

```
fuel_cost := ROUND(miles * rate, 2)
```

`rate` is `cost_per_mile` from the delivery's fuel type variant, falling back to
the fuel type row, then `0`.

Prepaid fuel does **not** reduce `fuel_cost` and is not a separate deduction.
Prepaid rows are consumed against this delivery's fuel expense (recording
`kind = 'fuel'` consumptions and advancing `consumed_amount` /
`fully_consumed_at`) so the prepaid balance is drawn down. The delivery is still
charged the full `fuel_cost`.

## 3. Amortized non-fuel expenses

For each approved/verified non-fuel expense whose type has
`amortize_over IS NOT NULL AND amortize_over > 0`, take a per-delivery slice:

```
slice := LEAST(ROUND(amount / amortize_over, 2), amount - consumed_amount)
```

Skip when `slice <= 0`. Sum into `amortized_total`. Each slice is recorded as a
`kind = 'amortized'` consumption and advances `consumed_amount`.

## 4. Immediate non-fuel, non-amortized expenses

One-shot: the **full** `amount` of every approved/verified expense whose type is
not fuel and has no `amortize_over`. Summed into `immediate_total`, and each row
is stamped `deducted_in_delivery_id` so it can never be deducted twice.

Rows whose description starts with `Auto-fuel for delivery` are excluded here —
fuel is handled in step 2.

## 5. Net income

```
net_income := GREATEST(tariff_total - fuel_cost - amortized_total - immediate_total, 0)
```

Floored at zero: deductions can exceed the tariff, and a settlement never books
a negative rider payout. When that happens the rider is paid nothing and the
deductions simply are not recovered — there is no clawback.

## 6. Split

`net_income` is then divided by the revenue-sharing percentages from step 1's
migration lineage, crediting `wallets` for rider, merchant, UCS Rides and
platform. Each credit writes a `wallets` transaction row whose description
names the delivery reference, the percentage, the net income, and the fuel and
expense deductions — that description string is the audit trail a rider sees.

## Why this is a doc and not code

This used to live at `src/lib/netRevenue.ts` with a 71-line test suite beside it.
It was removed because it had zero callers, and — the real problem — its test
could not detect the drift it existed to prevent. Every assertion was computed
from the TypeScript function itself; the `describe` block claiming to
"match backend net=230" was a hand-typed constant, not a backend call. So it was
green, typechecked, and exported while verifying nothing. A test that advertises
verification it does not perform is worse than no test, because it retires the
question.

A verifiable version was considered and rejected: asserting the TypeScript
matches the SQL means regex-matching PL/pgSQL, which breaks on cosmetic
reformatting and trains reviewers to rubber-stamp regex edits on a money path.