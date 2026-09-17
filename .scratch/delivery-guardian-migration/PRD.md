# PRD: Delivery Guardian — Lovable → Self-owned Supabase + Local Setup

## Background

Transferred project: Lovable ZIP extracted to local machine (`/home/aixrichlian/Downloads/download`).
App: Delivery Guardian — Vite React + shadcn + Supabase (`vite_react_shadcn_ts`).
Source DB: Lovable-managed Supabase `zxstiyqmaixyrtggwkwn.supabase.co` (see `.env`, `supabase/config.toml`).
Assets in ZIP: 92 migrations in `supabase/migrations/`, 5 edge functions, client in `src/integrations/supabase/client.ts`.

Source scale (from Lovable dashboard screenshot): 49 tables, `wallet_transactions` 132 rows,
`role_permissions` 120 rows, `delivery_alerts` 101 rows, 13 auth users,
4 storage buckets (`product-images`, `reconciliation-statements`, `odometer-photos`, `receipts`).

## Decisions (grilled)

- **Target:** new self-owned Supabase project (new ref, owner-chosen region).
- **Scope:** full copy — schema + data + Auth users + Storage objects + function secrets.
  Reason: `role_permissions`, merchant wallets, and storage objects are load-bearing for
  RiderDispatch, Settlements, and Reconciliation pages.
- **Source access:** user can fetch `service_role` key + Postgres connection string from Lovable dashboard.
  Anon key in `.env` alone is insufficient (cannot dump `auth.*`, `storage.objects`, RLS-protected rows).
- **Local toolchain:** Node 20 + npm + Supabase CLI + Docker.
- **Language:** **Merchant** canonical (see `CONTEXT.md`); `restaurants` is legacy; "Store" allowed only in customer-facing copy.
- **Cutover:** freeze writes in Lovable during dump + restore (30–60 min) to avoid wallet/order drift.

## Plan

1. Create target Supabase project; save ref + keys; backup `.env` → `.env.lovable`.
2. Local toolchain: `npm i`, Supabase CLI, Docker, `supabase link`.
3. Freeze Lovable writes; `pg_dump` source (data + `auth` schema); inventory storage.
4. Restore to target; verify table count (49) + row counts (wallet 132, role_perm 120).
5. Recreate 4 buckets; sync objects; preserve public/private flags.
6. Migrate 13 auth users (passwords via `auth` schema dump); verify login.
7. Deploy 5 edge functions + secrets (`modempay-webhook` has `verify_jwt = false`); replay one webhook event.
8. Switch `.env` to target; `npm run dev`; `vitest run`; verify `/shop`, `/s/:id`, `/shop/m/:id` signed-out + RLS verification page.

## Verification

- `supabase db push --dry-run` clean; 49 tables present on target.
- Row counts match source (± freeze-window delta = 0).
- Storage object counts match per bucket; signed URLs / public URLs load.
- Test login for admin + merchant-manager + rider roles works.
- `StoreLandingPage` shows "not open yet" for pending merchant; approved merchant renders for signed-out visitor.
- No `restaurants` reads in hot paths (legacy table ignored).

## Out of scope

- Renaming `restaurants` → `merchants` in old migrations (append-only; fix forward only).
- Renaming `rest*` variables in `src/` (separate cleanup issue).
- CI/CD, Capacitor native builds, App Store submission.

## ADR candidates (not yet created)

- 0001: self-owned Supabase as system of record, Lovable Cloud abandoned (hard to reverse, surprising billing/secret ownership, real tradeoff). Create on request.
