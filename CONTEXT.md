# Delivery Guardian

Platform for order delivery across merchants and riders, with settlement, wallets, and reconciliation.

## Language

**Merchant**:
A business selling through the platform.
_Avoid_: Restaurant, rest, store (in code/database), branch

**Sub-merchant**:
A Merchant owned by a parent Merchant.
_Avoid_: Branch, child store

**Rider**:
A person performing deliveries.
_Avoid_: Driver, courier

## Relationships

- A **Merchant** has zero or more **Sub-merchants**
- A **Sub-merchant** belongs to exactly one parent **Merchant**

## Example dialogue

> **Dev:** "When a **Merchant** places an order, do we check approval?"
> **Domain expert:** "No — approval applies to the **Merchant** selling, and an **Order** against a pending **Sub-merchant** is refused."

## Flagged ambiguities

- "restaurant" / "rest" / "store" / "branch" were used for **Merchant** — resolved: **Merchant** is canonical; "Store" allowed only in customer-facing copy, never in code or database names.
