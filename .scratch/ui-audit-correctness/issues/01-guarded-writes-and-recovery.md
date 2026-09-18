# 01-guarded-writes-and-recovery

Status: ready-for-human

## Ticket

Implement per `.scratch/ui-audit-correctness/PRD.md` (source of truth).

## TDD slices

1. **`guardedWrite` lib + tests**: success passthrough; supabase error normalization; unknown-error normalization (Error/string/object); toast-on-error default with `context`; `silent: true` opt-out; data pass-through on success.
2. **Theme A sweep (11 files, ~19 sites)**: DeliveriesPage (flag/unflag/delete), AlertsPage resolveAlert, FraudPage unflag, RidersPage (unassign/deactivate), MerchantsPage deactivate, SettlementsPage approveSettlement, RiderExpensesPage (markAlertRead/verifyExpense), ExpenseTypesPage (approve 2-phase/reject/default-unset), MerchantProductsPage (toggles/remove), RiderDashboard (accept/markCompleted), WalletPage Reject, SettingsPage confirmRemoveRole, RolePermissionsPage (togglePerm/deleteCustomRole/auto-populate). Rule: `if (error) return;` before toast + state change; revert optimistic state where already applied.
3. **Theme B confirms**: DeliveriesPage delete → AlertDialog; ReconciliationPage dispute → AlertDialog; WalletPage reject → reason dialog.
4. **E1 Auth recovery**: reset-password request with `resetPasswordForEmail`, `?reset=sent` state showing "check your email" guidance.
5. **E2 Checkout partial failure**: track per-merchant creation; on failure of merchant N: keep cart items for uncreated groups, clear created groups, honest toast with counts + deep-link My orders; `decidePostOrderNavigation` inputs adapted (lib untouched).
6. **Copy purge**: CartPage/CheckoutPage `|| "Store"` + footnotes; MerchantStorefrontPage "Store not found."

Work slice by slice: red → minimal → green. Per slice: `npx vitest run <touched>`, eslint on touched files.

## Blast-radius rule

`graphify affected guardedWrite` before finalizing; cover impacted callers in tests. All pages are route-only (degree ≤ 2 in graph) so page edits carry no library fan-out; the one shared-lib addition (guardedWrite) is new code.

## After merge

`graphify update .` (code-only fast path).

## Done when

PRD Done-when holds. Re-audit spot-checks pass. **Parallel-agent safety: never `git add`/commit/stash others' hunks; if a file shifted under you, re-read and re-apply the surgical edit only.**

## Comments

- 2026-09-18: created from ui-audit SUMMARY after reading finance-money-safety tracer (overlap = SettlementsPage/WalletPage only, different regions).
- 2026-09-18: **Implemented.** All slices landed. S2 sweep (19 sites, 18 files — incl. role-removal + togglePerm confirmed unguarded); S3 confirms (delete/dispute/reject use AlertDialog, destructive variant); S4 recovery (`/auth/reset` route, hash-detection → set-new-password panel, rate-limit-safe copy); S5 partial failure (`removeMerchant` in cart.ts + per-merchant order tracking; on failure keep created orders reachable, drop uncreated merchants, honest toast w/ counts; also gated the previously unchecked profile-update + customers.update); S6 copy (Cart/Checkout `|| "Store"`). Verification: tsc clean, **333/333 vitest**, eslint — 0 issues in new code; remaining 116 `no-explicit-any` etc. are pre-existing per file diff. Parallel-agent safety: other agent's review pass had already fixed unflagDelivery/deleteDelivery; all edits re-read current state first; no git staging of others' hunks.
