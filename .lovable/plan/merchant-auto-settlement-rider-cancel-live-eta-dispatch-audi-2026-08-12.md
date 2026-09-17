# Merchant auto-settlement, rider cancel, live ETA, dispatch audit log

Four changes across payments, dispatch, rider UI, and admin visibility.

## 1. Pay the merchant automatically on successful payment

Today a merchant wallet is only credited when a delivery is settled (revenue-share split). Nothing credits the merchant for the goods themselves.

- When a ModemPay payment succeeds and the order is submitted, credit the merchant's wallet with the **product subtotal only** (delivery fee excluded — that stays in the delivery revenue split).
- The credit is written as a wallet transaction labelled with the order reference, so it shows in the merchant wallet history.
- Runs once per order only. If the webhook is replayed or the same event arrives twice, no second credit is possible.
- If the merchant has no wallet yet, one is created at that moment.

## 2. Rider "Cancel acceptance"

- A rider who has accepted but not yet picked up sees a **Cancel acceptance** button on the active delivery.
- Cancelling releases the delivery back to `unassigned`, clears the rider, and re-offers it to nearby online riders (5km → 15km → all online), same tiering as Ready.
- The cancelling rider is excluded from the fresh offers so it doesn't bounce straight back to them.
- The order returns to **Ready — finding a rider** on merchant and customer timelines (today the mirror only moves forward, so it will be extended to handle release).
- Not allowed once the rider has marked pickup; then they must use the existing reject/reassign path.
- A reason prompt is shown (optional text) and recorded in the audit log.

## 3. Live distance / ETA on each offer

- Each rider offer card already shows a static distance. It will update continuously from the rider's live GPS watch position and also refresh the rider's stored location.
- Adds an **ETA** next to the distance, estimated from distance at an urban average speed (configurable constant, default 25 km/h), shown as "3.4 km · ~8 min".
- Same live distance/ETA shown on the accepted delivery card (distance to restaurant before pickup, to customer after pickup).

## 4. Admin dispatch audit log

New audit table capturing, per order:
- every dispatch attempt (which riders were offered, radius tier used, offer expiry)
- rider accept, reject, and cancel-acceptance events with reason
- every order and delivery status transition, with actor

New admin page **/admin/dispatch-audit**:
- Searchable by order reference, filterable by event type and date.
- Expandable per-order timeline showing the full chain from paid → offered → accepted → delivered, including failed/expired offers.
- Read-only; no one can edit or delete entries.

## Technical notes

- `submit_order`: after marking paid, insert a merchant wallet credit of `orders.subtotal`; add `order_id` to `wallet_transactions` plus a unique index on `(wallet_id, order_id)` for credits to enforce idempotency.
- New RPC `cancel_delivery_acceptance(_delivery_id, _reason)` (security definer): validates caller is the assigned rider and status is `dispatched`/`accepted`, resets delivery, expires the rider's own offer, re-runs the tiered offer loop excluding them, writes holder event + audit rows. Extend `mirror_delivery_status_to_order` to map `unassigned` back to `ready`.
- New table `dispatch_audit_log` (order_id, delivery_id, rider_id, event_type, detail jsonb, actor_user_id, created_at) with GRANTs, RLS admin/business_owner/accountant read-only, no client insert; populated from `mark_order_ready`, `claim_dispatched_order`, `reject_delivery`, the new cancel RPC, and the order/delivery status triggers.
- Frontend: `src/components/RiderDispatchOffers.tsx` (live ETA), `src/pages/RiderDashboard.tsx` (cancel button + live distance on active delivery), new `src/pages/DispatchAuditPage.tsx` + route and admin nav entry.
