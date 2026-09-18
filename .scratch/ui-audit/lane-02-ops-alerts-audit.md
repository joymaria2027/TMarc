# Lane 02 — Ops alerts & audit (Agent B, "Triage-auditor")

Persona: ops lead triaging exceptions; keyboard shortcuts user; finance-adjacent review duties.
Criteria: PRODUCT.md (explicit state, undo support, no toast-only validation) + UX §1, §2, §7, §8, §9.

## AlertsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **Bulk resolve loop writes sequentially without a transaction; partial failure UX is excellent, but single `resolveAlert` (line 104) has NO error handling** — failed single resolve leaves optimistic row resolved silently (state says resolved, DB says not). | UX §8 `error-feedback`, `state-clarity` | `src/pages/AlertsPage.tsx:104` | Capture `{ error }`, revert row + `toast.error` like `resolveSelected` does |
| P2 | **Loading state is a bare centered spinner** — every other ops page uses shimmer `Skeleton` rows with `role=status`; inconsistent and violates repo's own skeleton pattern (PRODUCT.md "earned familiarity"). | UX §3 `progressive-loading`, consistency | `src/pages/AlertsPage.tsx:236` | Swap to 3× `<Skeleton className="shimmer h-16 …">` + sr-only text |
| P2 | Resolve note error clears input selection but `aria-describedby` error paragraph renders *below the toolbar* far from the input on wrap — acceptable, but error also disables *every* Resolve button page-wide while any note text is over-limit (single-row Resolve at bottom right also disabled by noteError). Confusing coupling. | UX §8 `inline-validation` | `resolveAlert` gating `disabled={noteError !== null}` | Scope note validation to bulk flow; single Resolve doesn't need the note |
| P2 | `undoSnapshot` banner is good, but it disappears on filter change (snapshot persists in state while list no longer shows those rows; Undo then restores rows user can't see). State-explicitness gap. | PRODUCT.md #4 | `undoSnapshot` effect | Clear `undoSnapshot` when `filter`/`group`/`search` change (already cleared `selected` on those changes — extend to snapshot) |
| P3 | Keyboard shortcut help line duplicates `kbd` styling inline ×4 — extract tiny component. | consistency | shortcuts paragraph | `<Kbd>j</Kbd>` helper |
| P3 | Resolved rows `opacity-60` — meets disabled-state convention (0.38–0.5 recommended; 0.6 slightly high but readable; keep). | UX §8 `disabled-states` | resolved card | Keep (note only) |

Good: j/k/x// shortcuts with input-guard + dialog-guard, `aria-label`ed selects/checkboxes, 44px checkbox labels, select-all indeterminate state, `role=alert` note error, `aria-live`-able `role=status` counters, filter-clear empty state. This is the repo's most a11y-mature page; treat as reference.

## DispatchAuditPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Filter chips are 7 `Button`s rendering always-visible row** — on mobile this wraps into a control wall; also `aria-pressed` missing so state is color-only (default vs outline variant). | UX §1 `color-not-only`, §2 `touch-spacing` | `src/pages/DispatchAuditPage.tsx` EVENT_TYPES chips | Use `ToggleGroup type="single"` (already in ui/) or add `aria-pressed={type===t}` |
| P2 | Pagination "Previous / Show more" — **mislabeled pair** (Previous vs Show more aren't an axis); PRODUCT.md voice: plain verbs, one verb per action. Should be Previous/Next. | PRODUCT.md voice, UX §9 | `src/pages/DispatchAuditPage.tsx:214-215` | Rename to Previous/Next |
| P2 | `load()` sets `setLoading(true)` on *every* realtime-triggered reload → whole page flashes skeletons while patching would do (other pages patch-in-place). Audit log rows are append-mostly; INSERT handler already patches. Refresh button also full-flash. | UX §3 `content-jumping` | `load()` + Refresh | Full skeleton only on first load; subsequent = subtle `aria-busy` |
| P3 | Raw `JSON.stringify(e.detail)` in `code` — developer-facing dump on an ops page. | PRODUCT.md anti-ref (density earns) | event row detail | Pretty key: value chips, or keep but wrap `break-all` (already) — acceptable, note only |
| P3 | `aria-label` on expand button includes count — nice. Expanded panel lacks `role="region"`. | UX §1 | CardContent panelId | Add `role="region" aria-label={\`Events for ${ref}\`}` |

Good: grouped-by-order expansion with `aria-expanded`/`aria-controls`, tabular-nums on counts and page status, `time` elements, debounced reload.

## FraudPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`unflag` has zero error handling AND no confirmation** — clears `is_flagged` on a fraud-flagged delivery (money-safety adjacent); silent failure = flagged delivery appears cleared in UI but still flagged in DB, or vice versa after reload. For a fraud surface, state must be explicit. | PRODUCT.md #4, UX §8 | `src/pages/FraudPage.tsx:90` | `{ error }` + revert + toast; consider confirm since unflagging is an audit decision |
| P2 | Service-area form: `aria-invalid`/`aria-describedby` wired to a single shared `sa-form-error` — good — but error only renders at bottom; per-field errors are all-or-nothing from `validateServiceArea`. Acceptable; add `autoFocus` first invalid field. | UX §8 `focus-management` | addServiceArea dialog | `autoFocus` the offending input |
| P2 | Severity badges (Critical/Warning/Info) counted only from `open` items — but when all are 0, header shows "0 Critical 0 Warning 0 Info" noise row; collapse to a single "All clear" state. | PRODUCT.md "density where it earns" | header badges | Conditional render |
| P2 | Ack button `aria-label` uses raw id slice — screen reader gets "Acknowledge 3f2a19bc"; context-free. | UX §1 `aria-labels` | acknowledge row | Include check label: `Acknowledge ${c.label} · ${id.slice(0,8)}` |
| P3 | "Run your first audit" empty state + "Add your first zone" — good progressive onboarding. Ack wording "Ack" abbreviation vs PRODUCT.md plain verbs — spell "Acknowledge" (fits, short rows). | PRODUCT.md voice | Ack button | Rename |
| P3 | `aria-busy={false}` hardcoded on page root — either wire to `auditing` or remove. | UX §1 | root div | `aria-busy={auditing}` |

Good: shimmer skeleton w/ sr-only, `tabular-nums` money via `formatMoney`, severity icon+color+label (not color-only), collapsible rows with aria-labels, empty states with first-action CTA.

## MerchantAuditLogPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Loading state is a text-only `<p role="status">Loading audit log…</p>`** — no skeleton; inconsistent with sibling DispatchAuditPage one lane over. | UX §3, consistency | `src/pages/MerchantAuditLogPage.tsx` (~line 150) | Reuse shimmer skeletons |
| P2 | Filters: Selects have `min-h-[44px]` (good) but **page has no explicit mobile story for the 5-col table** — Table inside `space-y-2` without `overflow-x-auto` wrapper; narrow screens will clip Actor/Time columns. | UX §5 `horizontal-scroll` | Table container | Wrap in `overflow-x-auto` + `role="region" aria-label="Merchant audit log"` |
| P3 | Event badge variant chosen by `startsWith('qr_')` → outline vs default — two visual languages for one hierarchy level. | UX §4 `icon-style-consistent` analog | event badge | One variant + icon distinction |
| P3 | `get_public_profiles` RPC for actor names — fine; "Unknown user" fallback good. | — | actor cell | Keep |
| P3 | Empty-state copy differentiates filters-active vs not — good; add a "Clear filters" action button like AlertsPage. | UX §8 `error-recovery` | empty p | Add clear-filters button |

Good: debounced search (300ms) with comment, labelled filters (visible labels! not sr-only — matches finance-audit context), `scope="col"` headers, tabular time cells, per-row Details with aria-label including store name, Previous/Next naming (correct here — copy this to DispatchAuditPage).

## Lane 2 verdict

One P1 (single-resolve silent failure) + one P1 (fraud unflag silent failure). AlertsPage is the a11y benchmark; MerchantAuditLogPage's labelled filters + Previous/Next are the patterns to propagate.
