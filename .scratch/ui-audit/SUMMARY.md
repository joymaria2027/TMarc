# UI Audit Summary — All 51 Pages

Date: 2026-09-18 · Method: 10 parallel audit lanes (subagent-style personas), one report per lane in this directory.
Criteria: repo standards (PRODUCT.md, CONTEXT.md, index.css tokens) first, then ui-ux-pro-max Quick Reference §1–§10.

**Totals: 26 P1 · ~40 P2 · ~45 P3** across 10 lanes. The dominant disease is one pattern repeated ~15×: **optimistic writes with unchecked errors and unconditional success toasts** — UI and DB diverge silently, and on money paths that's a trust failure, not a cosmetic one.

## P1 findings (26) — grouped by theme

### A. Unchecked optimistic money/state writes (~14 instances, one systemic fix)

The same 3-line bug family. The repo already contains the correct pattern (`RiderDashboard.confirmReject` snapshot-rollback, `WalletPage.handleProcess`, `ProductApprovalsPage.approve`) — it just isn't applied everywhere.

| Page | Handler | What diverges on failure | Lane file |
|---|---|---|---|
| DeliveriesPage | `deleteDelivery` (no confirm either) | row gone from UI, delivery still exists | lane-01 |
| DeliveriesPage | `flagDelivery` | flag state | lane-01 |
| AlertsPage | `resolveAlert` | alert shows resolved, isn't | lane-02 |
| FraudPage | `unflag` | fraud flag cleared in UI only | lane-02 |
| RidersPage | `unassignMerchant`, deactivate | assignment/active state | lane-03 |
| MerchantsPage | activate/deactivate | merchant visibility in ops | lane-03 |
| SettlementsPage | `approveSettlement` | **money: settlement marked approved** | lane-04 |
| SettlementsPage | `handleIssuePayout` catch | **money: message claims "no changes confirmed" after partial success** | lane-04 |
| RiderExpensesPage | `markAlertRead`, `verifyExpense` alerts | expense verification signal lost | lane-05 |
| ExpenseTypesPage | `approve` (2-phase), `reject` | fuel price applied, request still pending → double-apply | lane-05 |
| MerchantProductsPage | `toggleActive`/`toggleToday`, `remove` | revenue-facing availability | lane-06 |
| RiderDashboard | `handleAcceptDelivery`, `handleMarkCompleted` | **money: rider completes unaccepted job** | lane-07 |
| SettingsPage | `confirmRemoveRole` | **security: removed user keeps access** | lane-09 |
| RolePermissionsPage | `togglePerm`, `deleteCustomRole` | **security: permission matrix lies** | lane-10 |

**Fix once:** extract `useGuardedWrite` (capture error → toast → revert/rollback) + apply repo-wide.

### B. Destructive actions without confirmation (3)
- DeliveriesPage `delete_delivery_cascade` fires immediately (lane-01)
- ReconciliationPage "Mark disputed" one-click on payment records (lane-04)
- WalletPage "Reject" withdrawal sits next to Approve, one click, no reason (lane-05)
- Reference in-repo: BusinessTypesPage, RevenueSharingPage, PaymentBackfillPage AlertDialogs.

### C. Money actions without preview/confirm (2)
- PayrollPage `run_payroll` pays from a dialog with no computed-amount preview (lane-04)
- RiderDashboard forced online/offline with no visible toggle or error path (lane-07)

### D. Named anti-references from PRODUCT.md (4)
- Mono-uppercase kicker + display-4xl headers: Settlements, Wallets, MerchantManagerDashboard, RiderDashboard, ShopPage, WholesaleApply (6 pages) (lanes 4/5/6/7/8)
- Hero-metric stat tiles: all 5 dashboards + borderline Analytics/GpsTracker/Reconciliation (lanes 6/7/9)
- 7-field modal CRUD: Create Delivery ×2 (MerchantsPage + MerchantManagerDashboard) (lane-03/06)
- "Restaurant" in customer-facing copy: CartPage fallback + footnote, MerchantStorefrontPage "Restaurant not found" — CONTEXT.md violation in the purchase funnel (lane-06/08)

### E. Missing user-recovery paths (2)
- No forgot-password flow anywhere (lane-07)
- CheckoutPage multi-merchant partial payment failure: orders created, cart not cleared, retry duplicates (lane-08)

### F. Data integrity surfaced as UI (2)
- RevenueSharingPage: can't set ratio for delivery-less merchant (schema workaround exposed to admin) (lane-05)
- RiderExpensesPage: `ridersForMerchant` stub filter `return true` → mis-attributable expenses (lane-05)

## P2 highlights (systemic)
1. **Three loading patterns coexist**: shimmer skeletons (good), text `<p role=status>`, bare spinner — standardize on skeletons.
2. **Realtime reload fan-out undebounced or full-skeleton** on ~8 pages (GpsTracker, DispatchAudit, Settlements, Wallets, dashboards) → content jumps. MerchantsPage's `scheduleLoad` debounce is the in-repo fix.
3. **Hardcoded chart colors** (`hsl(220…)`, light-only gridlines) on all 5 dashboards vs. brand tokens + `CHART_COLORS` already in `@/lib/finance` — dark mode breaks.
4. **Touch targets below 44px** in the purchase funnel: CartPage qty input, CheckoutPage GPS button.
5. **Header scale drift**: text-2xl vs display-4xl vs text-3xl across interior pages.
6. Money formatting: `formatMoney` exists but `D${x.toLocaleString()}` / `toFixed(2)` hand-rolls on ~10 pages.

## Reference implementations to propagate (in-repo, free)
| Pattern | Where |
|---|---|
| Optimistic write with snapshot rollback | RiderDashboard `confirmReject` |
| Checked write + toast discipline | WalletPage `handleProcess`, ProductApprovalsPage |
| Money-confirm dialog naming the amount on the button | PaymentBackfillPage AlertDialog |
| Chart a11y (role=img aria-labels + SrTable + TeachingEmpty) | AnalyticsCharts |
| Form fields (labels, autocomplete, aria-invalid, live errors) | Auth `Field`, CheckoutPage |
| Destructive confirm with consequence + reversibility copy | SettingsPage, BusinessTypesPage, ExpenseTypesPage |
| Async status surface (pending/paid/failed + aria-live transitions) | CheckoutStatusPage |
| Keyboard triage (j/k/x//, dialog/input guards) | AlertsPage |
| Deep-link gate with honest reasons | StoreLandingPage |
| Realtime patch-in-place + scoped channels | useRealtimeTable, MerchantProductsPage, MyOrdersPage |

## Recommended fix order
1. **`useGuardedWrite` + sweep the ~14 unchecked writes** (theme A) — highest severity-per-effort.
2. **Delete-confirm for delivery cascade + dispute + withdrawal-reject** (theme B).
3. **Purge "Restaurant" from Cart/Storefront copy** — 10-minute CONTEXT.md compliance win.
4. **Checkout partial-failure handling** (theme E2) — only real money-loss path.
5. **Forgot-password flow** (theme E1).
6. **Dashboard de-hero-meting + CHART_COLORS + header normalizer** — one shared component fixes 5 pages.
7. Loading-pattern + money-format standardization sweep.
8. IA pass on Layout sidebar grouping (29 → 4 labeled groups).
