# PRD: UI-audit correctness slice (Theme A/B/E1/E2 + copy purge)

Source of truth for `.scratch/ui-audit-correctness/issues/01-*.md`.
Derived from `.scratch/ui-audit/SUMMARY.md` (2026-09-18, 10-lane audit).

## Coordination (parallel agent on same checkout)

- `finance-money-safety` tracer (other agent, uncommitted, tests green) already covers Payroll/Settlements/Wallet progress-guards + `validateWithdrawal` wiring + maker-checker copy. **Out of scope here.**
- `audit-remediation` PRD owns theming/forms/perf/cosmetics (headers, hero tiles, skeletons, colors). **Out of scope here.**
- This slice owns only **correctness**: silent-failure writes, destructive-without-confirm, missing recovery paths, and the CONTEXT.md language violation. File overlap is limited to SettlementsPage/WalletPage (different regions — do not revert their hunks); re-read working tree before each edit.

## Problem (verified in code 2026-09-18)

1. **Theme A — unchecked optimistic writes (~19 sites, 11 files)**: `await write` result ignored, then unconditional success toast + state change. UI/DB diverge silently; on money/security paths this is a trust failure. Correct pattern already in-repo: `RiderDashboard.confirmReject` snapshot-rollback, `WalletPage.handleProcess`, `ProductApprovalsPage.approve`.
2. **Theme B — destructive without confirm**: `deleteDelivery` cascade fires immediately; ReconciliationPage "Mark disputed" one-click; WalletPage "Reject" adjacent to Approve with no reason.
3. **E1 — no password recovery anywhere** (repo-wide grep). Locked-out riders have no path.
4. **E2 — multi-merchant checkout partial failure**: orders insert in a loop; a failed payment-checkout for merchant 3 leaves orders 1–2 in DB, cart uncleaned (clear() after loop), retry duplicates orders.
5. **CONTEXT.md violation**: "Restaurant" fallback in CartPage/CheckoutPage customer copy; "Restaurant not found" on MerchantStorefrontPage.

## Scope

1. `src/lib/guardedWrite.ts` (new, near-pure): wraps a supabase-style `{ data, error }` promise; normalizes unknown errors (`message|details|hint|code|JSON`); toasts `context: message` on failure (suppressible); returns `{ data, error }` so call-sites stay supabase-shaped.
2. Sweep Theme A: gate every state change + success toast behind `if (error) return;` (most sites are await-then-mutate, so ordering suffices; no snapshot machinery except where state mutates before write).
3. Theme B: AlertDialog confirms (BusinessTypesPage pattern) for delivery delete + reconciliation dispute; WalletPage reject gains optional reason + confirm.
4. E1: reset-request flow on Auth (`supabase.auth.resetPasswordForEmail`) + `?reset=sent` guidance state.
5. E2: track created orders; on partial failure keep cart for uncreated groups, deep-link My orders with honest counts; clear only created groups' items.
6. Copy: Store (not Restaurant) in customer fallbacks.

## Non-goals

No theming/cosmetics (audit-remediation), no progress-guard work already done by finance tracer, no RPC changes, no new dependencies.

## Graph orientation (1 query spent)

- `graphify explain SettlementsPage`: degree 2 (useAuth + file container) — no graph dependents on any audited page; all are route-only in App.tsx. `guardedWrite` is new (no callers until sweep).
- Mirrored/duplicated symbols known: `describeError` string-normalizer exists inline in `RiderDashboard` (will remain; guardedWrite carries its own copy for lib purity). ShopPage/MerchantStorefrontPage confirmed duplicated (audit-remediation owns extract).

## Done when

- `npx vitest run src/lib/__tests__/guardedWrite.test.ts` green; **full `npx vitest run` green** (226+ existing incl. finance tracer's tests must stay green).
- `tsc --noEmit` clean; eslint clean on new/edited regions.
- `graphify affected guardedWrite` assessed at the end; `graphify update .` after merge (code-only fast path).
- Re-audit spot-check: flag/unflag, resolve, deactivate, approve, toggle, remove, role-delete all surface failure instead of false success.
