# Lane 10 — Platform data (Agent J, "Platform-auditor")

Persona: app developer / admin verifying security, payments, and platform metrics.
Criteria: PRODUCT.md (explicit state, tables for data) + UX §1, §3, §8, §10.

## RolePermissionsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`togglePerm` unchecked write + unconditional success toast + optimistic flip** — permission changes are the app's access-control surface; a failed write (RLS on role_permissions) shows "Updated View permission…" while the switch snaps back on next load, or stays wrong in-session. Security-critical explicit-state failure. | UX §8, PRODUCT.md #4 | `src/pages/RolePermissionsPage.tsx` togglePerm | Capture `{ error }`; revert switch + toast.error |
| P1 | **`deleteCustomRole` double unchecked delete** (role then permissions) — partial failure leaves orphaned permission rows; no confirm issue (AlertDialog present, good) but the write itself is blind. | UX §8 | deleteCustomRole | Check both; on second failure toast "Role removed but permissions remain — retry" |
| P2 | Auto-populate effect inserts missing permission rows on every load without error handling — silent insert bursts; also runs before user intent (rows created just by *viewing*). | UX §8, side-effect design | auto-populate useEffect | Wrap `{ error }` + consider lazily treating missing rows as all-false instead of materializing them |
| P3 | Otherwise strong: aria-live status region, buildSwitchAriaLabel helper, scope="col"/scope="row" table semantics, AlertDialogs with consequences, overflow-x-auto on the matrix. Keep. | — | — | Keep |

## RlsVerificationPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Page runs 10 sequential queries on mount for every visitor with the route — no role gate visible; riders get full check battery too. Perf + intent: it's a developer tool. | UX §3 | runChecks + useEffect | Gate by role (admin/app_developer) with explanatory empty state |
| P2 | Loading state is just the Re-run button spinner (`loading` disables button; body shows stale "No checks run yet" until done). First-load has no skeleton. | UX §3 | loading render | Skeleton cards |
| P3 | The PII-leak detector (checks 'phone'/'withdrawal_pin' keys in RPC sample) is a genuinely clever self-test. Role expectation callouts per session role — excellent explicit state. Keep. | — | checks | Keep |

## WebhookEventsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Search input has no label** (placeholder-only: "Search event type, order id, or reference…") — violates `input-labels`; every other page in the repo does this right. | UX §8 `input-labels` | search Input | Add sr-only Label |
| P2 | Replay is one click with no confirm on a payment webhook — replaying a 'processed' event is idempotent by design (duplicate status exists) so risk is low, but a failed/invalid_signature replay deserves no confirm while a *processed* one does. Note only. | UX §8 | replay | Optional confirm on processed |
| P2 | `font-display text-3xl` header — page-level scale drift again (interior pages are text-2xl). | UX §6 | h1 | text-2xl |
| P3 | Status + signature badges with distinct tokens, `role=alert` processing error, `<details>` payload disclosure, aria-label on toggle — good. | — | — | Keep |

## AnalyticsPage.tsx + AnalyticsCharts.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | 5 summary tiles — closest to acceptable (Completed/Avg time/Distance/Riders/Revenue are metric-true) but still the tile pattern; keep if compact. | PRODUCT.md anti-ref (borderline) | stats grid | Compact |
| P2 | Charts: legend via `label` on pie slices only; bar/line have no visible legend — but dual-axis charts get explanatory captions and SrTable fallbacks. | UX §10 `legend-visible` | bar charts | Add `<Legend />` (recharts) |
| P3 | **Best chart a11y in the repo**: role="img" with descriptive aria-label including peak values, SrTable per chart with captions, TeachingEmpty states with filter-clear action, lazy-loaded charts chunk, capped-at-1000 honesty line, formatMoney on revenue. This is the reference the dashboards should copy. | — | AnalyticsCharts | Keep; propagate |
| P3 | `aria-busy={false}` hardcoded (systemic). | UX §1 | root | Wire to loading |

## PaymentBackfillPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **The money-confirmation dialog done right**: "Run wallet backfill?" → credits N orders totalling D X → button literally says "Credit D 1,234.00". This is the pattern PayrollPage and SettlementsPage should copy (Lane 4 P1s). | PRODUCT.md #4 | AlertDialog | Propagate as reference |
| P2 | `runBackfill` success path is sound (reload report + runs + results); but no partial-failure nuance — RPC is atomic server-side presumably; note only. | — | runBackfill | Keep |
| P3 | CSV export with proper quoting, aria-label on icon-only export button, three status counts with tabular figures and per-status color+text, overflow-x-auto tables, teaching copy "goods subtotal only, delivery fees excluded". Excellent. | — | — | Keep; cite in SUMMARY |

## Lane 10 verdict

RolePermissionsPage holds two security-critical P1s (blind permission writes). The lane also contains the repo's two best reference implementations: AnalyticsCharts (chart a11y) and PaymentBackfillPage (money-confirm dialog).
