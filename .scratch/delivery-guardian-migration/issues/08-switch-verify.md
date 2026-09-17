# 08 — Switch .env + verify local

Status: needs-triage

## Context

`.env` currently points at Lovable (`zxstiyqmaixyrtggwkwn`). `.env.lovable` is the backup (from 01). Target switch must keep anon/publishable key pair consistent with target ref.

## Tasks

- [ ] Update `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` → target values.
- [ ] `npm run dev`; check `/shop`, `/s/:id`, `/shop/m/:id` signed-out (approved **Merchant** renders; pending shows "not open yet").
- [ ] `vitest run`; open `RlsVerificationPage` and confirm manager/rider/accountant scoping.
- [ ] Unfreeze: announce cutover; point DNS/app to target; keep Lovable read-only 7 days as rollback.

## Verify

- Signed-out storefront OK; 3 role logins OK; no console RLS 403s on happy path; Lovable retained only as rollback.

## Depends on

- 04, 05, 06, 07.

## Comments

- 2026-09-17: Toolchain is **bun** (Lovable-native; `npm install` fails: react-leaflet@5 wants React 19, project pins React 18).
  `bun install` 591 pkgs OK; `vitest` 16/16 pass; `vite build` clean; dev server 200 on :5173.
- 2026-09-17: Browser smoke test: /auth renders (DeliveryAce branding, zero errors); /shop renders but EMPTY + 4× 401
  on PostgREST — the pasted anon JWT is rejected (direct curl 401). service_role JWT works (storage uploads OK), so the
  anon string is bad/rotated. BLOCKED on fresh publishable/anon key from dashboard → Project Settings → API.
- 2026-09-17: Naming note: app brands as **DeliveryAce**, Lovable project is **Delivery Guardian** — resolve canonical
  product name post-cutover (CONTEXT.md currently says Delivery Guardian).
- 2026-09-17: `.env` now uses `sb_publishable_` key (legacy anon JWT 401s — string corrupted in transit, dashboard copy differs).
  Postgres URI correctly NOT in `.env` (VITE_ vars ship to browsers).
- 2026-09-17: SHOP IS LIVE against target — /shop renders 3 products with signed images, all API 200s.
  Anon merchants query returns [] by RLS design (no anon SELECT policy on merchants — matches source; `.lovable/plan.md`
  RLS hardening is the natural first dev task). Products visible via `products_public_read_approved`.
  Remaining: human login test (needs owner password), edge-function secrets (issue 07), migration repair.
