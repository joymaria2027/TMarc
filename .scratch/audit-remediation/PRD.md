# PRD: Audit Remediation to 20/20

## Goal

Fix all `/impeccable audit` P0/P1/P2/P3 across 46 surfaces to reach Audit Health Score 20/20.

## Source of truth

This ticket + the 5 subagent audit reports in conversation history (2026-09-17).
PRODUCT.md register: product primary, brand secondary (storefront).

## Scope slices (TDD)

1. P0 keyboard/safety: card-as-button, audit headers, receipt badge, permission switches, window.prompt/confirm, chart alts, file-upload focus.
2. P1 forms: Label htmlFor/id everywhere, inline errors + aria-describedby, sr-only search labels, autocomplete on auth.
3. P1 theming: token-only status colors (success/warning/info/destructive/accent), map/chart colors from CSS vars, dark-mode contrast 4.5:1.
4. P1 perf: realtime patch-not-reload, scope selects, paginate/virtualize 200-1000 row lists, memoize aggregates, debounce address/fee, incremental image URLs, lazy Leaflet + code-split recharts.
5. P1 responsive: 44px targets (restore button.tsx minimums), wrap headers/filters, stack dialog grids `grid-cols-1 sm:grid-cols-2`, table overflow wrappers.
6. P2: skeletons (.shimmer) + role=status, taught empties, shared ProductCard extract, tables for finance/audit/queues, kill border-l-2 stripes + hero-metric grids, tabular-nums on all money.
7. Polish: single toaster, NotFound Link + focus, DialogClose 44px, SelectTrigger h-11, time elements, aria-hidden decorative icons.

## Acceptance

- `npx vitest run` passes, `npx eslint` on touched files clean.
- Re-run `/impeccable audit` scores 20/20 (all 5 dims 4/4 per group).
- `graphify --update` refreshed after merge.

## Graph orientation (2026-09-17, 2 queries max used)

- Community 8 (form system): Label/Input/Dialog/Switch/Select/Textarea + MerchantsPage, MerchantProductsPage, RolePermissionsPage, StoreQrDialog. Edits here fan out to community 13 callers.
- ShopPage <-> MerchantStorefrontPage: NO graph path (ambiguous source, no link) = confirmed copy-paste duplication, safe to extract shared ProductCard.
