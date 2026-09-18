# Lane 06 — Merchant (Agent F, "Merchant-auditor")

Persona: merchant manager on mixed desktop/mobile, interrupted workflows; plus admin approvers.
Criteria: PRODUCT.md (one verb per action, explicit state, no modal-first 7-field CRUD) + UX §1, §2, §3, §5, §8.

## MerchantProductsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`toggleActive`/`toggleToday` fire-and-forget writes with no error path** — Switch flips optimistically… actually the Switch re-renders from `load()`; on failure the switch bounces back with no message, or worse stays wrong if load also fails. Merchant availability is revenue-facing. | UX §8, PRODUCT.md #4 | `src/pages/MerchantProductsPage.tsx:175-181` | Capture `{ error }`, toast, revert switch state |
| P2 | `remove()` deletes without checking error before success toast + dialog close — failed delete shows "Product deleted". | UX §8 | remove | `{ error }` guard |
| P2 | Approval-status badge text is raw `p.approval_status` ("approved"/"pending"/"rejected" lowercase) while other badges capitalize. | UX §6 consistency | product card badge | Capitalize / humanize |
| P3 | Product image upload has no preview before submit and no `aria-describedby` hint of accepted formats. | UX §8 | ProductDialog image field | Add thumbnail preview on select |
| P3 | Wholesale dialog inside a DialogTrigger pattern — `WholesaleSettingsDialog` renders as DialogContent child of trigger Dialog: works, but nested-open state isn't controlled; opening twice stacks. | — | wsOpen dialog | Controlled open like the product dialog |

Good: delete confirm dialog, rejection reason surfaced on card, `validateProductForm` with inline errors + aria wiring, per-merchant scoped realtime with filter + debounce, restaurant vs inventory adaptation, `is_active`/`available_today` as labelled Switches (better than ExpenseTypesPage's checkboxes).

## MerchantOrdersPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **`transition()` for non-ready statuses is a plain update with no guard against racing** — two managers clicking "Accept" simultaneously both succeed client-side; no optimistic-lock/version check. Medium because status transitions are semi-idempotent. | UX §8 `error-feedback` | transition() | Use an RPC like `mark_order_ready` for all transitions, or `.eq("status", from)` guard |
| P2 | "New paid order" toast fires on the manager's screen for every paid order realtime event even when looking at another page section — no link/deep-link to the order. | UX §8 `success-feedback`, §9 | toast in channel handler | Make toast actionable: link to `/merchant/orders` |
| P3 | Loading is text-only `<p role="status">` — skeleton pattern exists repo-wide. | UX §3 | loading branch | Shimmer card skeletons |
| P3 | Unread chat badge has `role="status"` on a span inside a button — announced well; label function `unreadLabel` centralizes copy. Excellent. | — | chat badge | Keep; document |
| P3 | Total/tabular-nums on items and totals — consistent. Keep. | PRODUCT.md #3 | order card | Keep |

Good: status timeline component reuse, nextActions map (single verb per status — exactly PRODUCT.md #2), scoped realtime, Previous/Next with page status, chat a11y (aria-expanded/controls).

## MerchantManagerDashboard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **Six hero-metric stat cards in a row** ("My Merchants, Total Deliveries, Active Now, Completed, Revenue, Settlements") — PRODUCT.md bans "hero-metric stat tiles" and "SaaS hero-metric hype" *by name*, with `font-display text-3xl` numbers. This is the anti-reference verbatim. | PRODUCT.md anti-ref | `src/pages/MerchantManagerDashboard.tsx` statCards + grid | Replace with a compact operational strip: Active Now + Settlements x/y + Revenue inline in header; drop My Merchants/Total (vanity) |
| P1 | **Header again: mono kicker "Operator" + `font-display text-4xl` "Merchant dashboard."** — third occurrence of the banned costume (Settlements, Wallets, here). | PRODUCT.md anti-ref | header | Same fix as Lanes 4/5 |
| P2 | Realtime: any deliveries/merchants/tariffs event → full `load()` of 5 tables, no debounce — dashboard flashes on every dispatch action across the platform. | UX §3 `content-jumping` | channel handlers | Debounce like MerchantsPage scheduleLoad |
| P2 | Create Delivery dialog (7 fields) duplicated from MerchantsPage including the anti-pattern — two copies to fix. Also loads ALL riders, not merchant-assigned. | PRODUCT.md anti-ref + data risk | createDelivery dialog | Shared NewDeliveryPage; scope riders via merchant_riders |
| P2 | Stat value `D${totalRevenue.toLocaleString()}` — no decimals, no formatMoney; tabular-nums present but inconsistent unit format. | PRODUCT.md #3 | statCards | formatMoney |
| P3 | Chart: Recharts with theme-aware colors — good; but no text alternative for the bar chart data (PRODUCT.md a11y: charts have text alternatives). | PRODUCT.md a11y | BarChart | Add sr-only summary "Last 7 days: N deliveries, M completed; busiest {day}" |
| P3 | `riders.map` in dialog shows online dot as text "• online" — fine, not color-only. Keep. | — | rider select | Keep |

Good: wallet widget integration, merchant quick-actions (Delivery/Tariff/QR one verb each), pending-review badge instead of dead button, recent deliveries with rider names.

## WholesalersPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Filter buttons use `aria-pressed` correctly (rare in repo!) — but page lacks the pending-count badge on the "Pending" chip; admin must click to discover workload. | UX §9 `tab-badge` analog | FILTERS buttons | Badge count on pending |
| P3 | Decline reason column doubles as input-per-row — unusual but works; aria wiring correct. On mobile the 5-col table needs overflow-x wrapper (none present). | UX §5 | Table | Wrap overflow-x-auto |
| P3 | "Application declined" vs button "Decline" — verb consistent. Good. | PRODUCT.md #2 | review() | Keep |

Good: role-gate message, per-row labelled reason inputs with error recovery, status badges with reasons inline, empty states per filter.

## ProductApprovalsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Approve/reject have no error-state recovery beyond toast — but here writes ARE checked (`if (error) toast.error else success+load`). Correct pattern. Note only. | — | approve/reject | Keep as reference |
| P2 | Pending badge in header + per-card "pending" badge duplicate — the card badge adds nothing (all rows are pending). | PRODUCT.md density | per-card Badge | Remove card-level badge |
| P3 | Image `alt={p.name}` — meaningful. Good. `loading="lazy"` + fixed 128px dims — no CLS. Exemplary `image-dimension`. | UX §3 | img | Keep |
| P3 | Signed-URL cache pattern (1h TTL shared) — good perf hygiene. | UX §3 | load() | Keep |

Good: reason-required-to-reject with inline error, aria-labels with product names, tabular prices, empty state.

## MerchantStorefrontPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **"Restaurant not found."** — CONTEXT.md forbids "Restaurant" in code/copy for Merchant; customer-facing store page uses the banned word. | CONTEXT.md language | `src/pages/MerchantStorefrontPage.tsx` !merchant branch | "Store not found." (Store allowed in customer-facing copy) |
| P2 | Add-to-cart success = toast only; no cart-count feedback in place on this page (cart lives in layout — verify). Add button doesn't show quantity-in-cart state for an already-added product. | UX §8 `success-feedback` | add handler | After add: button briefly shows "Added ✓" or badge with qty |
| P2 | Sold-out/Closed products keep full-size Add button disabled — fine — but no visually distinct card treatment (opacity/label position consistent). Minor. | UX §8 `disabled-states` | canBuy badges | Add `opacity-60` on unavailable card media |
| P3 | Wholesale quote display with strikethrough retail — excellent clarity. `min-h` reserves on title/description prevent CLS. Keep. | UX §3 | product card | Keep |
| P3 | "No image" fallback div inside link — announced as link text "View {name}" via aria-label; fine. | UX §1 | image link | Keep |

Good: single-link-per-card (tabIndex -1 duplicate), grouped sections with aria-labels, approved+active-only query (security), aspect-ratio reserved images, wholesale badge visibility.

## Lane 6 verdict

Lanes 4–6 share two systemic diseases: (1) the mono-kicker/display-4xl header costume (3 pages) and (2) hero-metric stat tiles (dashboard). Merchant surfaces additionally have fire-and-forget toggles (Products) and the CONTEXT.md language violation on the customer-facing storefront (highest embarrassment risk).
