# Payment reconciliation report, safe backfills, and merchant notifications

Four connected pieces around merchant settlement for online-paid orders.

## 1. Reconciliation report of paid orders

A new report lists every order paid through ModemPay and shows, per order: order reference, merchant, payment date, payment reference, goods subtotal, delivery fee, and whether the merchant wallet credit for the goods subtotal was applied (and when, for how much).

Each row lands in one of three states:
- Credited — a wallet entry exists matching the goods subtotal
- Missing — paid but never credited
- Mismatch — credited, but the amount differs from the current goods subtotal

Delivery fees are always excluded from the expected credit. The report can be filtered by date range, merchant, and state, and exported to CSV.

## 2. Backfills can never double-pay

Protection already exists at the ledger level: only one credit per order per wallet is possible, so re-running a backfill cannot create a second credit. On top of that:
- Every backfill run is recorded (who ran it, the date range, when, and the outcome for each order) so a repeated run is visible rather than silent.
- Two people running a backfill at the same time cannot both credit the same order; the second attempt is reported as "already credited", not an error.
- Mismatched credits are never silently topped up — they are reported and require a deliberate correction action.

## 3. Admin backfill page

New page **Payment Backfill** at `/admin/payment-backfill`, admin and accountant only:
- Pick a date range (and optionally a single merchant), then **Preview** — shows exactly which orders would be credited and the total amount, with no changes made.
- **Run backfill** applies the credits and shows a per-order result table: credited (with amount), skipped (already credited), or failed (with the reason).
- History of past runs with their results, so you can see whether a range was already processed.

## 4. Merchant notification on every credit

Whenever a wallet credit is applied — from a live payment or from a backfill:
- A wallet history entry is written, labelled with the order reference and marked as a backfill when it came from one.
- An in-app notification goes to the merchant ("Payment received for ORD-xxxx — D 5.00 credited to your wallet"), visible in the existing Alerts area and as a badge, with corrections labelled clearly.

## Technical notes

- Reporting RPC `payment_reconciliation_report(_from, _to, _merchant_id)` returning per-order expected vs actual credit and a status flag; drives both the report and the backfill preview.
- Idempotency relies on the existing partial unique index `wallet_tx_unique_order_credit (wallet_id, order_id) where type='credit'`; `credit_merchant_for_order` gains a `FOR UPDATE` lock on the order row and traps `unique_violation` to return "skipped" instead of failing.
- New tables `wallet_backfill_runs` (actor, range, counts, created_at) and `wallet_backfill_results` (run_id, order_id, outcome, amount, error) with GRANTs and admin/accountant read-only RLS; write path only through the security-definer RPC `run_wallet_backfill(_from, _to, _merchant_id, _dry_run)`.
- Notifications: extend the `delivery_alerts` alert_type check with `wallet_credit` and `wallet_credit_corrected`, targeted at the merchant manager; emitted from `credit_merchant_for_order`.
- Frontend: new `src/pages/PaymentBackfillPage.tsx` + route in `src/App.tsx` + nav entry in `src/components/Layout.tsx`; report section reuses the table patterns from `ReconciliationPage.tsx`.
