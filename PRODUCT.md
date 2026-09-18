# Product

## Register

product

## Users

- **Ops admins / dispatchers**: triage deliveries, rejections, dispatch audit, alerts, GPS tracking. Context: desktop back-office, high throughput, keyboard-heavy.
- **Accountants / finance**: settlements, payroll, reconciliation, wallets, revenue sharing, expenses. Context: monthly close, tabular numbers, audit trails.
- **Merchants / company managers**: products, orders, chat with customers, wholesalers, storefront. Context: mixed desktop/mobile, interrupted workflows.
- **Riders**: offers, accept/decline, navigation, expenses, wallet. Context: outdoor, mobile, gloves, glare, one-handed, 44px targets.
- **Customers (brand secondary)**: shop, product detail, cart, checkout, order tracking. Context: mobile-first storefront.
- **App developers**: webhook events, RLS verification, permissions, API.

Job to be done: move an order from cart to delivered to settled, with money reconciled and everyone paid.

## Product Purpose

Delivery Guardian (DeliveryAce) is the order-delivery operations and settlement platform across merchants and riders: dispatch, GPS, merchant catalog, storefront checkout, wallets, settlements, payroll, reconciliation, fraud prevention.

Success: dispatcher clears exceptions in seconds, rider completes offer flow one-handed, accountant reconciles without CSV exports, customer checks out without support.

## Brand Personality

Confident, warm, operational. Three words: warm, precise, unhurried.

Voice: plain verbs (Accept, Assign, Settle, Reconcile), one verb per action. No logistics-blue cliche, no SaaS hero-metric hype. Terracotta warmth, sage confirmation.

## Anti-references

- Generic logistics blue / navy+gold fintech; neon-on-black crypto; SaaS-cream AI landing.
- Editorial-magazine lane on ops surfaces (italic serif data, mono kickers as costume).
- Hero-metric stat tiles, identical icon+heading+text card grids for tabular data, side-stripe accent borders, gradient text, decorative glass, modal-first CRUD for 7-field forms.
- Emoji as status iconography; `window.prompt`/`confirm` for money/access; toast-only validation.

## Design Principles

1. Tool disappears into the task: earned familiarity over novelty.
2. One verb per action: Claim vs Accept vs Take-over never coexist; Merchant is canonical in code.
3. Numbers are tabular: every amount/percent/count is sans/mono tabular-nums, right-aligned in tables.
4. State is explicit: keyboard-reachable, labelled, announced (live regions), not color-only.
5. Density where it earns: tables for finance/audit/queues, cards only for commerce/overview.

## Accessibility & Inclusion

WCAG 2.2 AA minimum. 44px targets on rider/customer/mobile; visible focus rings; labels programmatically associated; inline errors with aria-describedby; charts have text alternatives; reduced-motion respected; `prefers-contrast: more` supported.
