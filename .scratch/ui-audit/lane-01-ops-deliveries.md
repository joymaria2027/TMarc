# Lane 01 — Ops deliveries (Agent A, "Dispatcher-auditor")

Persona: ops dispatcher on desktop back-office, high throughput, keyboard-heavy.
Criteria: PRODUCT.md anti-references + ui-ux-pro-max §1 A11y, §2 Touch, §3 Perf, §5 Layout, §8 Forms.

## DeliveriesPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **Delete is irreversible with no confirmation** — `delete_delivery_cascade` RPC fires immediately on click; PRODUCT.md bans `window.confirm`-style money/access prompts but requires *a* confirmation for destructive actions; a cascade delete of a delivery is destructive. | UX §8 `confirmation-dialogs`, `undo-support` | `src/pages/DeliveriesPage.tsx:249` (handler; wired in `DeliveriesTable` `onDelete`) | Route delete through `AlertDialog` (already in `components/ui`) stating what cascades; or add undo toast pattern used on AlertsPage |
| P2 | **Flag action fires without loading state or error handling** — `flagDelivery` awaits the update but has no `error` branch and no pending disable; double-click double-writes, silent failure leaves optimistic UI wrong. | UX §2 `loading-buttons`, `error-feedback` | `src/pages/DeliveriesPage.tsx:234-238` | Capture `{ error }`, toast on failure, disable the flag control while pending |
| P2 | **Search input is the only focusable path into filter chips; no visible "x" to clear** and clearing requires selecting-all text. Minor friction for keyboard-heavy dispatchers. | UX §8 `error-recovery`, §5 | `src/pages/DeliveriesPage.tsx:470-476` | Add clear button (`type="search"` affordance) inside the input |
| P3 | Detail dialog grid mixes `text-muted-foreground` labels and values inline — fine, but tariff/currency lines ("D{value}") aren't wrapped in `tabular-nums`, so digits jitter vs. other money screens. | PRODUCT.md principle 3 | `src/pages/DeliveriesPage.tsx` tariff/est/actual rows in detail dialog | Add `tabular-nums` to value spans |
| P3 | Status `<Select>` trigger uses `h-11` but search input doesn't match height — misaligned control row. | UX §5 `spacing-scale` | search Input ~line 473 | Match heights (`h-11` both) |

Good: skeleton+`role=status` loading, `aria-label` search/filter, region with accessible name on scroll area, deep-link highlight contract, empty-search `role=status` message, Suspense for map.

## RejectedDeliveriesPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **"Claiming…" disable is good, but the claim button label logic duplicates** (`Claim`/`Reclaim` computed in two places, card + dialog) — one verb drift risk; PRODUCT.md principle 2 says one verb per action. | PRODUCT.md #2 | `src/pages/RejectedDeliveriesPage.tsx:459,548` | Extract `claimLabel(d)` helper |
| P2 | **Claim sets rider online/active as side effect with no user awareness** — `handleClaim` updates `riders.is_online=true` silently; rider may not intend to go online. | UX §8 `error-clarity` (surprise state change) | `src/pages/RejectedDeliveriesPage.tsx` `handleClaim` (~line 300) | Either surface "Claim (you'll go online)" hint or separate the concern |
| P2 | Phone links `tel:` lack `aria-label` / visible affordance distinction; icon has `aria-hidden` but link text is the number (OK) — however `hover:underline`-only affordance fails on touch. | UX §2 `hover-vs-tap` | `src/pages/RejectedDeliveriesPage.tsx` phone rows | Add `underline underline-offset-2` by default, not only on hover |
| P3 | "Show more (N remaining)" full-width outline button — fine; but no `aria-live` announcement when list grows. | UX §1 `aria-live-errors` analog | show-more button | Add `role="status"` count text |
| P3 | Money "D {x}" formatted manually via `toFixed(2)` — should use `formatMoney` from `@/lib/finance` for locale/consistency (FraudPage already does). | PRODUCT.md #3, consistency | tariff lines | Reuse `formatMoney` |

Good: masked RPC for rider PII pre-acceptance, holder history, "You rejected" self-badge, lock states as text badges (not color-only), 44px link-button for "+N more".

## GpsTrackerPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Stat tiles skirt the hero-metric anti-reference** — PRODUCT.md bans "hero-metric stat tiles"; here 4 tiles are compact and data-true (counts), but "Total Riders" tile is pure vanity for dispatch (not actionable). | PRODUCT.md anti-ref | `src/pages/GpsTrackerPage.tsx` stats grid | Keep Online/On Delivery/GPS Active (operational); fold Total into the Riders list header |
| P2 | Rider cards in the scrollable list are not keyboard-selectable as a whole; only the embedded "Track rider" button is (which is good) — but list has no `aria-label` on the scroll region. | UX §1 `keyboard-nav` | riders list container | Add `role="region" aria-label="Active riders"` + `tabIndex={0}` |
| P2 | `200` page-size fetch of riders + all profiles + all in-flight deliveries on every delivery-event reload — fine at current scale, but no `loading` indicator on subsequent reloads (map silently goes stale then jumps). | UX §3 `loading-states` | `loadRiders` via realtime patch | Show subtle "updating…" state or optimistic merge (pattern exists in `useRealtimeTable`) |
| P3 | Coordinates shown to 4 decimals for dispatchers — precision noise; rider code/name is what they scan. | PRODUCT.md "density where it earns" | coords line | Consider showing only when no active delivery |
| P3 | Selected-card `ring-2 ring-primary` is good; add `aria-pressed` is present — but the *card itself* isn't the control, so `ring` on unselected hover uses `hover:bg-muted/50` only; fine. | — | — | No change |

Good: 44px "Track rider" with `aria-label` + `aria-pressed`, empty state with guidance text, Suspense map fallback, mergeUpdate preserving enriched fields.

## Lane 1 verdict

2 P1-class issues live here really as 1 P1 (delete confirm) + 1 P1-adjacent (silent flag failure escalates to data mismatch). Fix delete confirmation first.
