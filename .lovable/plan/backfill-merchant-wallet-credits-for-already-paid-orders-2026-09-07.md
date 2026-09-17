# Backfill merchant wallet credits for already-paid orders

## What's there now

Two orders were paid before automatic merchant settlement existed, and neither has a merchant credit:

- ORD-000018 — goods D 5.00 (total D 10.00, so D 5.00 delivery fee excluded)
- ORD-000019 — goods D 5.00 (total D 10.00)

Both belong to the same merchant. No other paid order is missing a credit.

## What the backfill does

For each paid order with no merchant credit yet, credit the merchant's wallet with the goods subtotal only, using the same settlement routine the live payment flow now uses. That means:

- Delivery fees stay out of the credit — they remain in the delivery revenue split.
- A wallet history entry is added, labelled with the order reference.
- If a merchant has no wallet, one is created.
- Re-running is safe: an order that already has its credit is skipped.

Expected result: the merchant's wallet balance rises by D 10.00 total, with two new entries in wallet history.

## Technical note

Run a single data statement calling the existing `credit_merchant_for_order(id)` function for every order where `payment_status = 'paid'` and no `wallet_transactions` credit row exists for that order. No schema change and no code change needed; the function is already idempotent via the per-order credit check.
