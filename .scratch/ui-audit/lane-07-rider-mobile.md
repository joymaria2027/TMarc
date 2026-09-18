# Lane 07 — Rider mobile (Agent G, "Rider-auditor")

Persona: rider outdoors, mobile, gloves, glare, one-handed; PRODUCT.md's most demanding user.
Criteria: PRODUCT.md (44px targets, one-hand flow, glare) + UX §1, §2, §5, §7, §8.

## RiderDashboard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`handleAcceptDelivery` is a fire-and-forget write on the rider's core action** — `await update({status:'accepted'})` unchecked, then success toast + optimistic flip. RLS/lock failure shows "Delivery accepted!" that isn't true; rider shows up at pickup for an unaccepted job. | UX §8, PRODUCT.md #4 | `src/pages/RiderDashboard.tsx` handleAcceptDelivery | Use the RPC path (`rpcClaimDelivery`-style) with error handling like handleClaimDelivery right below it (which does it correctly) |
| P1 | **`handleMarkCompleted` same pattern** — marks delivered, gps_confirmed false, unchecked write + success toast. A rider can "complete" a delivery that silently failed, and money settles on it. | UX §8, PRODUCT.md #4 | handleMarkCompleted | Capture error; require confirm dialog (this is the money event) |
| P1 | **Auto-online on mount, offline on unmount with unchecked writes and no user control** — rider is forced online by visiting the page; no visible online/offline toggle. PRODUCT.md "State is explicit": the rider's most important state (online) is invisible to them and uncontrollable. | PRODUCT.md #4, UX §8 | auto-online effect (~line 200) | Add explicit Online/Offline Switch in header; write errors surfaced |
| P2 | **Header costume #4**: mono kicker "On the road" + display-4xl "My deliveries." — on a *rider's phone* this eats ~120px of prime glare-prone vertical space before the wallet and offers. Density-hurts here worst of all pages. | PRODUCT.md anti-ref + rider context | header block | Compress to single-line text-2xl header on mobile |
| P2 | Section headers "My queue" / "Unattended / Rejected" also mono-kicker style (text-[11px] uppercase) — illegible in glove/glare conditions at 11px. | UX §6 `readable-font-size` analog, rider context | two section h2s | text-sm font-semibold normal case |
| P2 | `End Delivery` destructive-red full-width button — destructive color for the *primary completion* action. Red = danger; ending a delivery is success. | UX §4 `state-clarity`, color semantics | End Delivery button | Primary variant; keep destructive for cancel-acceptance |
| P3 | `reject` flow is the app's best optimistic pattern: snapshot → optimistic removal → rollback on error → resync. Document as the repo reference. | — | confirmReject | Keep; propagate to Lanes 3/5 |
| P3 | Odometer start/end dialogs with photo capture — good validation gate; minMiles guard on end phase. Keep. | — | OdometerCaptureDialog | Keep |
| P3 | Completed cards `opacity-75` — slightly below the 0.38–0.5 disabled range but these aren't disabled; fine. | — | completed card | Keep |

Good: haversine distance fallback, rev-share payout estimate in detail dialog with full split breakdown, rejection history with "or hidden by access rules" honesty, 44px Accept/Reject in dialog, offers-empty state routes to claim pool.

## rider/QueueCard.tsx + rider/OfferCard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | All five queue actions are `min-h-[44px]` — excellent. But no `aria-live`/`role=status` anywhere in either card: after tapping Accept/Start/Complete, feedback is toast-only (screen reader may miss sonner; PRODUCT.md wants announced state). | UX §1, PRODUCT.md #4 | QueueCard.tsx:58-77, OfferCard.tsx:84-87 | Parent adds `aria-live="polite"` region mirroring card status, or sonner ensured announced |
| P2 | OfferCard Accept and Reject are side-by-side flex-1 — 44px height ok, but with gloves the destructive Reject sits immediately adjacent to Accept; spacing between the two is just `gap` default (8px ok) — risk of mis-tap on the money-critical pair. | UX §2 `touch-spacing` | OfferCard actions | Keep gap-2 minimum; visually separate Reject (outline) from Accept (default) — variant split already helps |
| P3 | statusColor map (in RiderDashboard, passed down) duplicates deliveryStatusMeta from lib/deliveries — two sources of truth for status styling. | UX §4 consistency | statusColor | Unify on deliveryStatusMeta |

## Auth.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **No "Forgot password" flow exists in the entire app** (repo-wide grep confirms). A locked-out rider on the road has no recovery path — support bottleneck. | UX §8 `error-recovery` | missing | Add reset-request link on sign-in; supabase.auth.resetPasswordForEmail |
| P2 | Sign-in error maps *any* failure to the password field (`'pass-in': msg`) — "Email not confirmed" shows under password; misleading recovery cue. | UX §8 `error-clarity` | handleSignIn catch | Route message by code: email-related → email field |
| P2 | Left editorial panel: blur circles + display-serif 5xl — brandable, but the mono kicker "Operations platform / v3" is the costume again (marketing surface, more defensible; note only). | PRODUCT.md anti-ref | aside | Optional |
| P3 | `Field` component: h-11 inputs, labelled, aria-invalid + describedby + role=alert live errors, autocomplete tokens — exemplary. Reference for all forms. | — | Field | Keep |
| P3 | `noValidate` + custom validation — consistent inline errors, no browser popup clash. Keep. | — | forms | Keep |

Good: sign-in/up tabs with deep-link `?next=` + role-aware defaults (`as=customer` → /shop), loading spinner with role=status, welcome copy in PRODUCT.md voice.

## Lane 7 verdict

The rider lane concentrates the most dangerous P1s: unchecked writes on accept/complete (money events), forced-invisible online state, and no password recovery. It also contains the repo's best patterns (confirmReject snapshot-rollback, Auth Field, odometer gates) to generalize.
