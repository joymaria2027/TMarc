# Lane 08 — Customer storefront (Agent H, "Customer-auditor")

Persona: customer on mobile, first-time and returning; checkout must never lose money or clarity.
Criteria: PRODUCT.md (mobile-first, explicit state, plain verbs) + UX §1, §2, §5, §8.

## ShopPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Header promises food only**: "Good food, close by" + "approved neighborhood kitchens" + "dishes" copy — but business types include Pharmacy etc. (ShopPage itself renders BusinessTypes filter). Non-food merchants read as miscategorized. | PRODUCT.md (Store = customer-facing OK), domain truth | header + empty state + count lines | Neutral commerce copy: "From stores near you", "products", "items" |
| P2 | "Marketplace" mono kicker — costume again, customer-facing. | PRODUCT.md anti-ref | header | Drop |
| P3 | Everything else is reference-grade: aria-live announcer for cart adds, role=search form, shimmer skeletons with aria-live, count with role=status, Previous/Next with tabular page indicator, merchant rail with 44px cards. | — | — | Keep |

## CartPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`merchant_name \|\| "Restaurant"` fallback renders the banned word in customer-facing UI** (CartPage card title) and the footnote "…restaurants will be placed as separate orders" hardcodes it. CONTEXT.md: Restaurant banned; Store allowed in customer copy. Same fallback also in CheckoutPage group card. | CONTEXT.md language | `src/pages/CartPage.tsx` merchantName fallback + footnote; `CheckoutPage.tsx` same | `\|\| "Store"`; footnote: "…stores will be placed as separate orders" |
| P2 | Quantity `Input type=number` uses default height (h-9/36px) with w-20 — below the 44px mobile target for the stepper-est control in the funnel. | UX §2 `touch-target-size` | qty input | `h-11 w-20 text-center` + `-/+` buttons at 44px |
| P2 | No live announcement on quantity change (remove announces; qty edits don't) — subtotal changes silently for SR users. | UX §1 | qty onChange | setAnnouncement on qty change with new line total |
| P3 | Empty state with CTA — good. Grouped-per-merchant with per-group subtotal — matches multi-order reality. | — | — | Keep |

## CheckoutPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **Multi-merchant partial payment failure strands created orders**: orders+items are inserted per merchant in a loop; if merchant 3's `modempay-create-checkout` throws, catch toasts raw error — orders 1–2 exist in DB, cart is NOT cleared (clear() sits after the loop), retry duplicates orders 1–2. Money-adjacent data integrity + no user guidance. | UX §8 `error-recovery`, money safety | `src/pages/CheckoutPage.tsx` submit() loop + catch | On partial failure: keep created order ids, toast "N orders placed — M failed. Pay placed ones from My orders", clear cart only for created groups, deep-link My orders |
| P2 | "Use current GPS location" button is `size="sm"` (32px) — key mobile affordance below 44px. | UX §2 | GPS button | size default or min-h-[44px] |
| P2 | Delivery fee resolution is async+debounced with no pending indicator — total can change after page settles without acknowledgment. | UX §3, PRODUCT.md #4 | fees effect | Per-card "calculating…" shimmer on the fee Row while unresolved |
| P3 | Reference-grade elsewhere: focus first invalid field via `firstInvalidField`, inline auth with tabs + autocomplete tokens, aria-live announcements for every state change, RadioGroup rows at 44px, per-merchant fee transparency, "Pay D X with ModemPay" button that names the verb and the amount. | — | — | Keep |
| P3 | GPS success sets lat/lng silently in tiny caption — fine; add toast already exists. | — | useGps | Keep |

## ProductDetailPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | "Dish not found" / "Browse dishes" — same food-only copy bias (pharmacy product 404s as a "dish"). | domain copy | not-found branch | "Product not found" |
| P3 | Wholesale min-qty hint via aria-describedby, qty clamping to min, stock badges with states, add-to-cart aria-label includes qty, image aspect-square no CLS — all exemplary. | — | — | Keep |
| P3 | Unit price switches at wholesale threshold silently — the min hint text explains; consider inline "price drops to D X at N units" nudge when qty just below min. | UX §8 `progressive-disclosure` | wholesale block | Optional enhancement |

## CheckoutStatusPage.tsx

Exemplary. Realtime + 5s poll, aria-live status transitions ("Payment is now paid"), distinct pending/paid/failed surfaces with icon+color+text, retry paths from every state, tabular totals. No P1/P2 found. `humanizePaymentStatus` collapses unknowns to "pending" — honest default. Keep as the repo's reference for async-state UX.

## MyOrdersPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Header `font-display text-4xl` inside a back-button row — on mobile the three-element row (44px back, big title, Refresh) is tight; title wraps to 2 lines on 320px. | UX §5 | header row | text-2xl like interior pages |
| P3 | Best-in-app otherwise: single announcer for realtime (statuses + inbound messages + haptics), aria-busy on refresh, aria-pressed filters, per-item 44px line rows, sr-only "total"/"Order" words for SR sentence flow, unread badge with sr-only count + 99+ cap, "Rider not assigned yet — live map appears once picked up" explicit-state copy. | — | — | Keep; cite in SUMMARY as reference |

## WholesaleApplyPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Kicker "Wholesale" + display-3xl — costume (minor on marketing-ish surface). | PRODUCT.md anti-ref | header | Optional drop |
| P3 | State-machine view (no application → form; pending → review notice; rejected → reason; approved → CTA) with role=status copy — model pattern for application flows. aria wiring on all inputs. Keep. | — | — | Keep |

## StoreLandingPage.tsx

Exemplary deep-link gate: distinct honest reasons (not found / under review / closed) each announced via aria-live, then redirect if ok. Keep as reference for share-link handling.

## Lane 8 verdict

Strongest lane overall — the storefront team internalized PRODUCT.md's a11y and explicit-state principles. Remaining work: purge "Restaurant" fallback copy (CONTEXT.md violation in the purchase funnel), fix multi-merchant partial-payment handling (only true money-loss path in the lane), and 44px on qty/GPS controls.
