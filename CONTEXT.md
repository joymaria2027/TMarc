# Delivery Guardian

Platform for order delivery across merchants and riders, with settlement, wallets, and reconciliation.

## Language

### Parties

**Merchant**:
A business selling through the platform.
_Avoid_: Restaurant, rest, store (in code/database), branch

**Sub-merchant**:
A Merchant owned by a parent Merchant.
_Avoid_: Branch, child store

**Rider**:
A person performing deliveries.
_Avoid_: Driver, courier

**Customer**:
An individual purchasing goods from a Merchant for delivery or pickup.
_Avoid_: User (when referring to a buyer), shopper, consumer, client

**Wholesaler**:
A verified commercial business buyer entitled to purchase products from Merchants at discounted wholesale rates and minimum quantities.
_Avoid_: Supplier, vendor, distributor

### Fulfillment & Dispatch

**Order**:
A commercial purchase contract between a Customer and a Merchant for goods.
_Avoid_: Cart, basket, purchase, booking

**Delivery**:
The physical transportation of goods from a Merchant to a destination.
_Avoid_: Trip, ride, drop, shipment, run

**Offer**:
A time-limited invitation extended to an eligible Rider to perform a Delivery.
_Avoid_: Ping, dispatch ticket, job broadcast

**Accept**:
The action of a Rider agreeing to an Offer.
_Avoid_: Claim, grab, take-over

**Assign**:
The action of an Ops Admin or Merchant directly allocating a Delivery to a specific Rider.
_Avoid_: Dispatch to (when referring to manual allocation), delegate

### Finance & Accounting

**Wallet**:
An internal ledger maintaining the accrued balance for a specific platform party.
_Avoid_: Account, bank account, cash drawer, balance sheet

**Settlement**:
The accounting calculation and operational approval of revenue splits and expenses for completed deliveries.
_Avoid_: Payout, clearance, billing, invoicing

**Withdrawal**:
A request and transfer of funds from an internal Wallet to an external bank or mobile money account.
_Avoid_: Cash-out, payout, disbursement, refund

**Reconciliation**:
The verification and matching of external payment gateway or bank statement records against internal system transactions.
_Avoid_: Settlement (when referring to statement matching), audit, balancing

**Payroll**:
A recurring, scheduled compensation run for contracted or salaried personnel.
_Avoid_: Settlement, commission, wage batch

## Relationships

- A **Merchant** has zero or more **Sub-merchants**
- A **Sub-merchant** belongs to exactly one parent **Merchant**
- A **Customer** places an **Order** at retail catalog pricing
- A **Wholesaler** places an **Order** at wholesale rates with minimum order quantities once approved
- An **Order** may generate zero or one **Delivery**
- A **Delivery** may be linked to an **Order** or created independently
- An **Offer** is accepted by at most one **Rider**
- A **Wallet** belongs to exactly one party (Merchant, Rider, Platform, or Business Owner)
- A completed **Delivery** undergoes **Settlement** to distribute earnings into **Wallets**
- A **Withdrawal** debits an approved amount from a **Wallet** to an external destination
- **Reconciliation** verifies internal payments and **Withdrawals** against external statements
- **Payroll** executes scheduled wage disbursements distinct from per-delivery **Settlement**

## Example dialogue

> **Dev:** "When a **Merchant** places an order, do we check approval?"
> **Domain expert:** "No — approval applies to the **Merchant** selling, and an **Order** against a pending **Sub-merchant** is refused."

## Flagged ambiguities

- "restaurant" / "rest" / "store" / "branch" were used for **Merchant** — resolved: **Merchant** is canonical; "Store" allowed only in customer-facing copy, never in code or database names.
- "claim" vs "accept" in dispatch — resolved: Riders **Accept** an **Offer**; **Claim** is avoided across UI and API semantics.
- "settlement" vs "reconciliation" vs "payout" — resolved: **Settlement** is internal revenue splitting; **Reconciliation** is external statement matching; **Withdrawal** is cashing out to external accounts.
- "wholesaler" as supplier vs buyer — resolved: A **Wholesaler** on this platform is an approved business customer who buys in bulk from a **Merchant**, not an upstream supplier.
