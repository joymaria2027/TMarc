# Lane 05 — Finance money (Agent E, "Treasury-auditor")

Persona: accountant + merchant manager handling wallets, ratios, expenses; zero tolerance for silent money-state divergence.
Criteria: PRODUCT.md (money safety, tabular numbers, explicit state) + UX §1, §3, §5, §8.

## WalletPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Header repeats the banned costume**: mono uppercase kicker "Treasury" + `font-display text-4xl` "Wallets." (with dramatic period). PRODUCT.md anti-ref names "mono kickers as costume"; header scale inconsistent with app. | PRODUCT.md anti-ref, UX §6 | `src/pages/WalletPage.tsx` header block | Plain text-2xl h1, no kicker |
| P2 | Money strings hand-rolled: `D {balance.toFixed(2)}` in 5+ places (dialogs, verify screen) — no `formatMoney`, no tabular-nums on the bold amount spans. | PRODUCT.md #3 | withdraw/process/PIN dialogs | `formatMoney` + `tabular-nums` |
| P2 | Reject is a one-click destructive button sitting directly beside "Approve & Forward" in the same footer — no confirm, no reason input (AlertsPage resolve requires a note; rejection of a withdrawal doesn't). | UX §8 `confirmation-dialogs` | process dialog footer | Confirm + optional reason field for Reject |
| P3 | PIN flow is genuinely good: InputOTP, two-step set with confirm, verify-with-amount-shown before submit, Back restores the amount dialog state. Keep as reference. | — | PIN dialogs | Keep |
| P3 | `handleProcess` error handling is correct (toast + no optimistic flip) — the page's writes are safer than its siblings'. | — | handleProcess | Keep |

Good: role-split approve→finalize with explanatory copy of who debits, skeleton with aria-busy, `validateWithdrawal` with aria-invalid/describedby, folder grouping only when >3 wallets, empty-state explains wallet creation.

## RevenueSharingPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Ratio creation hard-depends on a delivery existing**: "No deliveries found for this merchant. Create a delivery first." — the UI surfaces a schema workaround (delivery_id placeholder) as a user task. Admin setting up a *new* merchant can't set the ratio before dispatching, exactly when it's needed most. | UX §8 `error-recovery`, product defect surfaced | `src/pages/RevenueSharingPage.tsx` createShare insert branch | Backend: make delivery_id nullable for merchant-level rules; UI: hide the failure mode |
| P2 | Same `aria-busy={false}` hardcode; realtime reloads full `load()` on every ratio event. | UX §1/§3 | root + channel | aria-busy wired to loading |
| P3 | "Total check" Σ column with icon + number is a model of state-explicitness (not color-only). | — | total check cell | Keep; propagate |
| P3 | Rider-role adaptation (personal vs default rate caption, "—" for non-rider columns) is clean. | — | rider view | Keep |
| P3 | Percent inputs have min/max/step + `validateSharing` + shared role=alert error. Good. | — | form | Keep |

Good: destructive delete has AlertDialog spelling out the downstream consequence ("won't credit any wallets until a new rule is set") — the best delete copy in the app.

## RiderExpensesPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`markAlertRead` unchecked write + unconditional optimistic removal** — failed update removes the alert from UI; manager never sees an expense needing verification. Money-safety adjacent (unverified expenses flow into settlements). | UX §8, PRODUCT.md #4 | `src/pages/RiderExpensesPage.tsx` markAlertRead (~line 250) | Capture error; keep alert on failure |
| P1 | **`verifyExpense` approval writes expense status, then rider notification insert is unchecked** — if the alert insert fails, rider is never told their expense was approved/rejected while ops believes alerts sent. Also `approve`-side: toast "Expense approved" fires from label regardless of alert outcome. | UX §8 `error-feedback` | verifyExpense alert insert | Check insert error; toast "Approved, but rider notification failed — retry" |
| P2 | **`ridersForMerchant` is a stub**: `.filter(r => { return true; })` with TODO comment — admin selecting a merchant still sees every rider; mis-attributed expenses are one wrong pick away. | UX §8 `error-clarity`, data quality | ridersForMerchant | Filter by `merchant_riders` (table already fetched elsewhere in repo) |
| P2 | Alert messages embed `D${amt.toLocaleString()}` — no decimals, inconsistent with `formatMoney` elsewhere. | PRODUCT.md #3 | createExpense/verifyExpense messages | formatMoney |
| P3 | Consumption highlight flash (1.5s) has no `aria-live` announcement — visual-only state change. | UX §1 | highlighted map | Add polite live region "Expense X consumed by D Y" |
| P3 | Delivery dialog tariff rows: `D{value}` without tabular-nums. | PRODUCT.md #3 | detail dialog | tabular-nums |

Good: maker-checker in the copy, status badges with icons, receipt via signed URL with noopener, Show more with remaining count, tab defaulting to Alerts when unread exist, ExpenseFormDialog extracted (form state lifted properly).

## ExpenseTypesPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`approve(c)` two-phase write with unchecked second phase**: fuel_variant update succeeds → `fuel_price_changes` status update unchecked. Failure leaves variant changed + request still "pending" → admin retries → double-apply, or pending list lies. Fuel price feeds rider expense math. | UX §8, PRODUCT.md #4 | `src/pages/ExpenseTypesPage.tsx` approve | Check second update; on failure toast "Applied but request still marked pending — reload" + reload |
| P1 | **`reject(c)` fully unchecked + success toast** — same systemic pattern. | UX §8 | reject | Capture error |
| P2 | Native `<input type="checkbox">` ×5 instead of the repo's `Checkbox`/`Switch` — inconsistent control styling on a finance-admin page. | UX §4 `consistency` | type/variant dialogs | Swap to ui/checkbox |
| P2 | Variant row uses `grid-cols-4` inside a card — on 375px the price/cost columns clip; no overflow wrapper. | UX §5 `horizontal-scroll` | variant row grid | Stack to 2 cols on mobile (`grid-cols-2 sm:grid-cols-4`) |
| P2 | Raw prices `D{v.price_per_litre}` — no toFixed/formatMoney; "45.5" renders next to "D" label span. | PRODUCT.md #3 | variant cells | formatMoney |
| P3 | Unset-default update before insert/edit is unchecked (submitVariant). | UX §8 | submitVariant | Capture |
| P3 | Maker-checker notice ("Your edit will be sent to an admin…") is exactly PRODUCT.md's explicit-state voice. | — | accountant edit | Keep |

Good: amortize recommendation logic with per-category explanation text, three distinct AlertDialogs with consequences, pending-approvals badge count on tab, role-gated controls.

## Lane 5 verdict

Worst lane for the systemic P1 (unchecked optimistic money writes): 5 instances across 4 pages (markAlertRead, verifyExpense alerts, approve 2-phase, reject, plus WalletPage none). WalletPage's PIN + two-step withdrawal flow is the app's best money UX; ExpenseTypesPage's maker-checker copy is the best state-explicitness.
