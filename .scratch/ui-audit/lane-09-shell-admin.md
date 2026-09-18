# Lane 09 — Shell & admin (Agent I, "Shell-auditor")

Persona: every role's first 5 seconds; navigation is the product frame.
Criteria: PRODUCT.md (navigation consistency, no hero-metric tiles, explicit state) + UX §1, §2, §3, §9.

## Layout.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | **Sidebar has 29 flat nav items with no grouping** — ops, finance, admin, dev all intermixed in one scroll list; PRODUCT.md `nav-hierarchy` demands primary vs secondary separation. Admin scan time is the cost. | UX §9 `nav-hierarchy`, `adaptive-navigation` | `src/components/Layout.tsx` navItems | Group with section labels (Operations / Finance / Admin / Developer); collapse inactive groups on mobile |
| P2 | `scroll-behavior`: nav uses inline `maxHeight: calc(100vh - 14rem)` — magic number couples sidebar footer height; role-dense admins (all roles) can still clip. | UX §5 | nav style | Flex layout: `flex-1 min-h-0 overflow-y-auto` |
| P2 | Mobile overlay uses `backdrop-blur-sm` at z-20 while sidebar is z-30 and header z-40 — blur is decorative (PRODUCT.md bans decorative glass) and scrim could be flat `bg-foreground/40`. | PRODUCT.md anti-ref `decorative glass` | overlay div | Remove blur, keep opacity |
| P3 | Exemplary otherwise: skip link, focus trap + Escape with focus return, `aria-current="page"`, alert bell with sr-count and 9+ cap, `aria-expanded`/`aria-controls` on menu button, focus moves into opened sidebar. Reference implementation. | — | — | Keep |
| P3 | "View Storefront" opens `/shop` in new tab with `target=_blank` — fine; consider same-tab (users rarely need the ops app open simultaneously). | UX §9 | storefront link | Optional |

## AdminDashboard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **6 hero-metric stat tiles** — the banned pattern, and this is the default landing for admins. Same finding as MerchantManagerDashboard; systemic. | PRODUCT.md anti-ref | statCards grid | Compact operational strip (Active / Alerts / Online riders are the actionable three) |
| P2 | **Charts hardcode blue `hsl(220,70%,50%)` + green `hsl(145,60%,42%)` and fixed light-mode grid color `hsl(220,15%,88%)`** — off-brand (brand is burnt orange/sage), invisible gridlines in dark mode. PIE_COLORS adds blue/purple. | PRODUCT.md brand, UX §6 dark-mode | PIE_COLORS, chart fills, grid strokes | Use CHART_COLORS from `@/lib/finance` (already exists — AnalyticsCharts imports it) + `hsl(var(--border))` |
| P2 | `markNotifRead` unchecked write + optimistic read_by update + no toast — silent divergence (systemic P1 family). | UX §8 | markNotifRead | Capture error |
| P2 | No text alternative for any chart (sr-only table), unlike AnalyticsCharts' SrTable. | UX §10 `data-table` | both charts + pie | Reuse SrTable pattern |
| P3 | Realtime load() fan-in undebounced (4 channels) — same systemic perf note. | UX §3 | channels | Debounce |

## AccountantDashboard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | 6 stat tiles (Delivered / Pending Settlement / Approved / Revenue / Pending Withdrawals / Open Alerts) — three of these are actionable (Pending Settlement, Pending Withdrawals, Open Alerts); rest is hero-metric filler. | PRODUCT.md anti-ref | statCards | Keep actionable three; link each to its queue |
| P2 | Pie-less but stacked bar uses hardcoded green/yellow — same brand/dark-mode issue. | UX §6 | BarChart fills | CHART_COLORS |
| P3 | Pending withdrawals + pending expenses cards with counts and links-in-title only — the money queues are right; make each row a link to the action (Wallets, Rider Expenses). | UX §9 | pending cards | Row-level links |

## BusinessOwnerDashboard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | 6 stat tiles + revenue-by-merchant pie with hardcoded palette; same systemic findings. | PRODUCT.md anti-ref | statCards, PIE_COLORS | Same |
| P3 | Pie has side legend with values (text alternative implicitly) — closer to compliant; add SrTable for SR. | UX §10 | pie | SrTable |

## AppDeveloperDashboard.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | 6 tiles + 4 more "system health" tiles = **10 stat tiles on one page** — densest hero-metric violation; developer dashboard could be links into the platform-data pages it already has. | PRODUCT.md anti-ref | statCards + health grid | Collapse to links/strip |
| P3 | Charts hardcoded colors again. | UX §6 | fills | CHART_COLORS |

## SettingsPage.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P1 | **`confirmRemoveRole` unchecked delete + unconditional toast + optimistic removal** — removing an admin's role silently failing means they keep access while ops believes they were removed. Security-adjacent state divergence. | UX §8, PRODUCT.md #4 | confirmRemoveRole | Capture `{ error }`; keep row on failure |
| P2 | `assignRole` error path shows both toast AND statusMessage + the dialog isn't form-validated before submit (empty email → DB roundtrip error "User not found" instead of inline validation). | UX §8 `inline-validation` | assignRole | Validate email non-empty inline first |
| P3 | Role removal AlertDialog copy is exemplary (states consequence + reversibility). aria-live status region present. Keep. | — | AlertDialog | Keep |

## NotFound.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P2 | Bare 404 with "Oops!" copy and raw `<a href="/">` (full reload, escapes SPA) — no link back to role dashboard, no search. Also no `role` semantics issue but plain anchor loses client routing. | UX §8 `error-recovery`, §9 | NotFound.tsx | Link component to `/`, dark-mode aware bg (hardcoded bg-muted ok), drop "Oops!" per PRODUCT.md voice (unhurried, plain) |

## Index.tsx

| Sev | Finding | Rule | Location | Fix |
|---|---|---|---|---|
| P3 | Role-priority router is clean; loading spinner bare (no sr-only label unlike others) — add `role="status"` + sr-only "Loading…". Spinner-without-label inconsistency. | UX §1 | loading branch | Add sr-only |

## Lane 9 verdict

Layout is a11y-exemplary but information-architecture-poor (29 flat items). All five dashboards clone the banned hero-metric pattern and hardcoded off-brand chart colors — one shared `DashboardStatStrip` component + CHART_COLORS adoption fixes all five pages at once. SettingsPage adds a security-adjacent P1 (unchecked role removal).
