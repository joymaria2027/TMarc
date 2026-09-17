# Ready → Rider Pool → Transit → Delivered

Most of this flow already exists, but three things break the experience you described. This plan closes those gaps.

## What's wrong today

1. **Only "assigned" riders get the offer.** When a merchant hits Ready, the order is offered only to riders explicitly linked to that merchant (and within 5km). A nearby available rider who isn't linked to the restaurant never sees it.
2. **Offers die after 3 minutes with nothing taking over.** There is a "widen the pool" routine (15km, any online rider), but nothing ever calls it. If no linked rider accepts within 3 minutes, the order silently goes nowhere.
3. **The order jumps to "Picked up" on the timeline before any rider accepts.** Marking Ready immediately sets the order to `dispatched`, so the customer and merchant see a courier stage that hasn't happened yet.

## What changes

**Dispatch on Ready**
- Offer the delivery to every active, online rider within 5km of the restaurant — merchant-linked riders included, not required.
- If no rider is within 5km, immediately fall back to 15km, and then to all online riders, so an order is never left with zero candidates.
- Offer window stays 3 minutes for the near pool.

**No dead offers**
- The rider offers feed also surfaces any still-unclaimed delivery whose near-pool offers have lapsed, to any online rider within 15km. This makes widening automatic without a scheduler, so an unaccepted order keeps circulating instead of stalling.

**Correct status progression**
- Ready (delivery order) → order stays **Ready**, shown as "Ready — finding a rider" on the merchant and customer views.
- Rider accepts → order moves to **Dispatched** (rider en route to restaurant).
- Rider confirms pickup → **Picked up** → **In transit** (existing rider flow, already wired to the transit queue).
- Delivery completed → **Delivered** on all three views.

**UI touches**
- Rider dashboard offers panel: refresh on new deliveries in realtime, plus show distance from restaurant and a countdown on each offer.
- Merchant Shop Orders: after Ready, show whether a rider has been found or the search is still open.

## Technical notes

- Rewrite `mark_order_ready` to build the candidate pool by distance with tiered fallback, and to leave `orders.status = 'ready'` (delivery record still created as `unassigned`).
- Extend `mirror_delivery_status_to_order` to mirror `dispatched` so a rider claim advances the order.
- Extend `get_offered_orders_for_rider` to union lapsed-offer deliveries within 15km for the calling online rider; keep `claim_dispatched_order` authoritative (it must accept a claim on those too, so its "offered to you" check is relaxed to "in your reachable pool").
- Frontend: `src/components/RiderDispatchOffers.tsx` (realtime + countdown + distance), `src/pages/MerchantOrdersPage.tsx` (rider-search state), `src/components/OrderStatusTimeline.tsx` (a "Finding rider" indicator on the Ready step for delivery orders).
