# UI Audit — All Pages

Date: 2026-09-18 · Method: 10 parallel audit lanes (subagent-style personas), one report per lane.

## Criteria

Two layers, checked in priority order (ui-ux-pro-max §1→§10):

1. **Repo standards first** — `PRODUCT.md` (brand personality: warm/precise/unhurried; design principles: one verb per action, tabular numbers, explicit state, density where it earns; anti-references: hero-metric tiles, gradient text, decorative glass, emoji status icons, toast-only validation, modal-first CRUD for 7-field forms), `CONTEXT.md` (Merchant canonical language), `src/index.css` tokens (semantic colors, focus rings, reduced-motion, prefers-contrast, safe-area utilities, tabular-nums).
2. **ui-ux-pro-max Quick Reference** — Accessibility (contrast 4.5:1, focus, aria), Touch (44px targets, loading feedback), Performance (CLS, skeletons), Style (SVG icons, no emoji), Layout (mobile-first, no h-scroll), Typography (16px base, tabular data), Animation (150–300ms, reduced-motion), Forms (labels, inline errors, destructive confirm), Navigation (state preservation, active states), Charts (legends, alternatives).

## Severity scale

- **P1** — Blocks task or excludes users (a11y violation, money-data ambiguity, broken state, touch target failure on rider flow)
- **P2** — Friction / unprofessional (missing loading state, inconsistent verb, contrast below AA on secondary text, color-only status)
- **P3** — Polish (spacing rhythm, icon consistency, minor copy)

## Lanes (pages per lane)

1. `lane-01-ops-deliveries.md` — DeliveriesPage, RejectedDeliveriesPage, GpsTrackerPage
2. `lane-02-ops-alerts-audit.md` — AlertsPage, DispatchAuditPage, FraudPage, MerchantAuditLogPage
3. `lane-03-ops-directories.md` — RidersPage, MerchantsPage, BusinessTypesPage
4. `lane-04-finance-settlement.md` — SettlementsPage, PayrollPage, ReconciliationPage
5. `lane-05-finance-money.md` — WalletPage, RevenueSharingPage, RiderExpensesPage, ExpenseTypesPage
6. `lane-06-merchant.md` — MerchantProductsPage, MerchantOrdersPage, MerchantManagerDashboard, WholesalersPage, ProductApprovalsPage, MerchantStorefrontPage
7. `lane-07-rider-mobile.md` — RiderDashboard (+ rider components), Auth
8. `lane-08-customer-storefront.md` — ShopPage, StoreLandingPage, ProductDetailPage, CartPage, CheckoutPage, CheckoutStatusPage, MyOrdersPage, WholesaleApplyPage
9. `lane-09-shell-admin.md` — Layout, AdminDashboard, AccountantDashboard, BusinessOwnerDashboard, AppDeveloperDashboard, SettingsPage, NotFound, Index
10. `lane-10-platform-data.md` — RolePermissionsPage, RlsVerificationPage, WebhookEventsPage, AnalyticsPage + AnalyticsCharts, PaymentBackfillPage

## Report format (per lane)

```md
# Lane NN — <name>
Persona: <who> · Context: <device/usage>

## <Page>
| Sev | Finding | Rule (repo / UX §) | Location | Fix |
```

Findings must cite file + line. Every P1/P2 gets a concrete fix. Cross-lane systemic issues get repeated on each affected page (dedup happens at consolidation).
