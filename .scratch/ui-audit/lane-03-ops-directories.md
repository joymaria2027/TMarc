# Lane 03 — Ops directories (Agent C, "Directory-auditor")

Persona: admin managing riders/merchants on desktop; manager on mixed devices.
Criteria: PRODUCT.md (one verb per action, modal-first-CRUD ban, explicit state) + UX §1, §2, §3, §5, §8.

## RidersPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`unassignMerchant` writes then toasts success unconditionally** — delete result never inspected; a failed unassign (RLS, network) still shows "Merchant removed" while the badge stays until reload. Silent divergence between UI and DB. | UX §8 `error-feedback`, PRODUCT.md #4 | `src/pages/RidersPage.tsx:74-80` | Capture `{ error }`, early-return with `toast.error`; only then toast success (or optimistically remove) |
| P1 | **Deactivate/Activate rider: same pattern** — `await update` unchecked, optimistic `setRiders` + success toast regardless of failure. Deactivating a rider is an ops-critical state change. | UX §8, PRODUCT.md #4 | `src/pages/RidersPage.tsx:177-183` | Capture error, revert optimistic state on failure |
| P2 | `createRider` inserts `user_roles` row without error check after rider insert succeeds — silent partial failure leaves a role-less rider. | UX §8 `error-recovery` | `src/pages/RidersPage.tsx:63-66` | Check error; toast "Rider created but role assignment failed — retry in Permissions" |
| P2 | Merchant-assign X button inside badge is `min-h-[44px] min-w-[44px]` — accessible but visually enormous inside a `text-xs` badge; layout jitter. Alternative: keep 44px hit area via `hitSlop`-style padding with smaller visual. | UX §2 `touch-target-size` vs visual balance | remove buttons in badges | Wrap: `p-2 -m-2` pattern (44px hit, 24px visual) |
| P2 | No pagination guard on `filtered` when searching: `visibleCount` resets correctly, but there is no "N of M" status — user can't tell if list is complete. | UX §8 `empty-states`, §5 | grid section | Add count line `{visibleCount} of {filtered.length}` with role=status |
| P3 | Loading = skeleton (good) but realtime `load()` on every riders/merchant_riders event re-fetches everything without debounce — bursts cause flicker; MerchantsPage in same lane has `scheduleLoad` debounce. | UX §3 | channel handlers | Copy MerchantsPage's 350ms debounce |
| P3 | Fuel select trigger `h-11 text-xs` — good height; label visible. Keep. | — | fuel row | No change |

Good: 44px Create Rider, aria-labelled vehicle/badge states, sr-only search label, empty state differentiates search vs no-data.

## MerchantsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **Merchant Activate/Deactivate: unchecked write + optimistic update + unconditional toast** — same systemic P1 as RidersPage. Also no confirmation for *Deactivate* (removes merchant from active ops). | UX §8, PRODUCT.md #4 | `src/pages/MerchantsPage.tsx` deactivate handler (~line 800) | Error capture + AlertDialog for Deactivate (BusinessTypesPage delete dialog is the in-repo reference) |
| P2 | **Create Delivery dialog is a 7-field modal** — PRODUCT.md explicitly bans "modal-first CRUD for 7-field forms" (pickup, dropoff, ref, name, phone, tariff, rider). This is the named anti-pattern. | PRODUCT.md anti-ref | Create Delivery Dialog | Move to a dedicated `/deliveries/new` page (prefilled merchant), keep quick-claim modal under 3 fields |
| P2 | Admin card density: up to 6 selects + switch + 5 buttons per card — exceeds "density where it earns"; controls compete with the merchant identity. | PRODUCT.md principle 5 | card body | Collapse admin assignments into an "Admin" disclosure (Collapsible) per card |
| P2 | Rider-assign Select has no `value` prop — after assigning, the trigger keeps showing the last pick while the list refreshes; reads as "not saved". | UX §8 `success-feedback` | rider assign select | Controlled reset to `''` after assign |
| P3 | Deep-link highlight via `data-merchant-id` + scrollIntoView — good; but no `role="status"` announcement that the target was found. | UX §1 | highlight effect | Optional: sr-only live region "Showing {name}" |
| P3 | "D{Number(t.tariff_amount).toLocaleString()}" — money formatted inconsistently (no decimals here, `toFixed(2)` elsewhere). | PRODUCT.md #3 | tariff badge | `formatMoney` from `@/lib/finance` everywhere |

Good: grouped sections with aria-label, Previous/Next with page status, reject flow via AlertDialog with reason (accessible replacement for prompt — exactly the repo pattern), aria-required/aria-invalid wiring in all dialogs, business-type empty hint.

## BusinessTypesPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Loading is a centered spinner, not the repo's shimmer skeleton — third inconsistent loading pattern in this lane. | UX §3, consistency | `src/pages/BusinessTypesPage.tsx:85-90` | Shimmer skeleton rows |
| P2 | Toggle Activate/Deactivate has no aria-pressed and variant stays `outline` in both states — state is text-only; acceptable, but Switch component (used in MerchantsPage) is the better control. | UX §1 `color-not-only` / control choice | toggleActive button | Use `Switch` with visible label |
| P3 | Delete confirm dialog is exemplary (states consequence + irreversibility) — reference for Lanes 1/3 P1s. | — | AlertDialog | Keep; document as pattern |
| P3 | Table not wrapped in overflow-x-auto; 5 columns fit at 375px? Description wraps; Actions wraps to 3 rows. Cramped but usable. | UX §5 | Table | Wrap in overflow-x-auto for safety |

Good: aria-labels on every row action, `scope="col"`, tabular-nums counts, per-field inline errors with aria-describedby, admin-gate message.

## Lane 3 verdict

Systemic P1: **optimistic writes without error capture** (RidersPage ×2, MerchantsPage ×1). One named anti-pattern hit: 7-field modal CRUD on MerchantsPage. BusinessTypesPage is the in-repo reference for destructive-action confirmation.
