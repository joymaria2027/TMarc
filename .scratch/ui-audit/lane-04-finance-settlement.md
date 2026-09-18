# Lane 04 — Finance settlements (Agent D, "Accountant-auditor")

Persona: accountant at monthly close; tabular numbers, audit trails, zero ambiguity on money.
Criteria: PRODUCT.md (tabular-nums everywhere, explicit state, money safety) + UX §1, §3, §6, §8, §10.

## SettlementsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`approveSettlement` marks money-settled with unchecked write + unconditional success toast** — `await update({settlement_approved: true…})` never inspected; optimistic row flip + "Settlement approved" toast even on RLS/network failure. Accountant believes money approved when it isn't (or row lies until reload). Highest-risk finding of the audit. | PRODUCT.md #4 + money safety, UX §8 | `src/pages/SettlementsPage.tsx:250-260` (approveSettlement) | Capture `{ error }`; on error keep row unapproved + `toast.error`; consider AlertDialog confirming "Approve settlement for {order_reference} — D{amount}" |
| P1 | **`handleIssuePayout` catch message misleads on partial failure** — sequential loop approves rows one-by-one; on row 5/10 failure the catch says "no changes were confirmed" while 4 rows *are* approved in DB. | UX §8 `error-clarity` | `src/pages/SettlementsPage.tsx` handleIssuePayout catch | Track confirmed count; message "Approved N, failed at row M — reload to see current state"; or make it a single RPC |
| P2 | **Header uses mono uppercase kicker ("Finance" in `font-mono text-[11px] uppercase tracking-[0.18em]`)** — PRODUCT.md anti-reference names "mono kickers as costume" verbatim. | PRODUCT.md anti-ref | page header | Delete the kicker; keep plain h1 |
| P2 | Share math takes `firstDelivery.sharing` for the whole summary — if a rider's deliveries span merchants with different ratios the displayed payout is wrong. Not strictly UI, but it's money displayed to an accountant. | PRODUCT.md "numbers are tabular" (trust) | rider/merchant share calc | Compute per-delivery and sum; or badge "mixed ratios" when deliveries disagree |
| P2 | Realtime reload sets full skeleton on every deliveries/expenses/sharing/wallets event — close-month screens flash while typing elsewhere. | UX §3 `content-jumping` | load() + 4-channel fan-in | First-load skeleton only; afterwards `aria-busy` + patch |
| P3 | Page title `font-display text-4xl` vs `text-2xl font-bold` on every other page — inconsistent header scale. | UX §6 `font-scale` | h1 | Standardize to text-2xl (or lift to Layout) |
| P3 | Totals footer cells repeat `D{…toFixed(2)}` ×8 — use `formatMoney`; "D" concatenation appears in toasts too. | PRODUCT.md #3 | TableFooter | `formatMoney` |

Good: exemplary table a11y (`aria-label` + sr-only `caption` per table), tabular-nums on every numeric cell, role-aware default tab, money-guard partitioning with skipped-count messaging, 44px Show more, empty states per tab. Structurally the strongest finance page.

## PayrollPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`createAssignment` validates, then on DB success clears form — but the form-clear happens before `load()` completes and there's no error path for `is_active` defaulting; minor. The real P1: `runPayroll` fires `run_payroll` RPC that *pays money* from a dialog whose only guard is a date check — no confirmation summary of computed amount before running, and `runError` renders but dialog stays open with stale helper text "Will pay fixed D…" even after amounts change.** Money action without explicit confirm state. | PRODUCT.md #4, UX §8 `confirmation-dialogs` | `src/pages/PayrollPage.tsx` runPayroll + dialog | Show computed preview line inside dialog (period × basis), require explicit "Run payroll — pay D{amount}" button label |
| P2 | `aria-busy={false}` hardcoded on page root — should be `loading`. | UX §1 | root div | `aria-busy={loading}` |
| P2 | Inactive badge text `inactive` lowercase vs `Active` capitalized in same column. | UX §6 consistency | status cell | Capitalize |
| P2 | Amount column mixes formats: `D1200.00` vs `45% of payer wallet income` — unit and money in one column without alignment rule. | PRODUCT.md #3 | Amount cell | Money right-aligned tabular; percent as secondary line |
| P3 | Runs table `D{amount}` inside a success-colored Badge — color implies "good"; a run could be 0.00 and still green. | UX §1 `color-not-only` | computed amount badge | Neutral badge; keep icon |
| P3 | Date inputs `type="date"` — good; add `max={today}` on period_end to prevent future runs. | UX §8 | run dialog | Add max attr |

Good: captions + aria-labels on both tables, tabular-nums everywhere, Previous/Next with page status + total, period validation via `validateRunPeriod`, 44px Run button, sr-only loading with shimmer.

## ReconciliationPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Summary cards are 4 stat tiles (Received/Paid Out/Net/Unmatched)** — PRODUCT.md bans "hero-metric stat tiles"; these are at least data-true and actionable (Unmatched drives work). Borderline: keep, but shrink to a single compact row; the "Showing latest N of up to 1000" caption is the honest part. | PRODUCT.md anti-ref | stats grid | Compact into one line with tabular figures |
| P2 | **Mark matched / Mark disputed are one-click icon buttons with no confirm** — disputing a payment entry changes audit state instantly; icon-only (aria-label present) but destructive-ish action has no undo. | UX §8 `confirmation-dialogs`, `undo-support` | actions cell | Confirm on "disputed" (AlertDialog); matched can stay one-click + undo toast |
| P2 | Full skeleton reload on every realtime event (`setLoading(true)` in load) — same systemic pattern. | UX §3 | load() | Patch or aria-busy |
| P2 | Upload control: invisible file input stretched over a Button — clickable, labelled; but button also clickable → double-hit area nesting (button inside span inside button semantics via asChild={false} + input overlay). Screen reader announces both. | UX §1 | Upload cell | Drop the wrapping Button; make the input itself the styled control |
| P3 | `viewStatement` opens signed URL via `window.open` — add `rel` semantics n/a for window.open; fine. Add loading state on the View button (signed URL can take a second). | UX §2 `loading-buttons` | viewStatement | Button pending state |
| P3 | Status filter Select default height vs search Input — mismatched control heights in one row. | UX §5 | filter row | h-11 both |

Good: `formatMoney` used consistently, tabular-nums on all amounts, In/Out badges with icons (not color-only), empty state with working "Clear filters", aria-labels on every icon action, `role="status"` count line — the honest-capabilities caption pattern ("up to 1000 entries") is exactly PRODUCT.md's explicit-state voice.

## Lane 4 verdict

Two P1s are money-path: unchecked `approveSettlement`, misleading partial-failure payout message, plus PayrollPage's pay-without-preview. This lane's tables are the best-built in the app; the money *actions* behind them are the weakest links.
