# Decouple commercial Orders from physical Deliveries into separate entities

Online ordering platforms often treat an order and its delivery as a single entity or 1:1 table. We decided that `orders` and `deliveries` must remain decoupled entities with independent lifecycles — linked optionally via `orders.delivery_id` and `deliveries.order_reference` — because the platform supports omnichannel fulfillment: customer pickup orders have no delivery, and direct phone/walk-in merchant dispatches have a delivery without a storefront cart order.

## Considered Options

- Unified `orders` table containing rider assignment, GPS, and odometer fields — rejected: forces pickup orders to carry meaningless logistics fields and prevents merchants from dispatching ad-hoc deliveries for offline customers.
- Strict 1:1 foreign key requirement between orders and deliveries — rejected: breaks standalone deliveries created via the dispatch portal.

## Consequences

- Financial settlement operates at the `delivery` level for transport tariffs and at the `order` level for merchant goods revenue; accounting and reporting queries must not assume every delivery has an e-commerce order row.
