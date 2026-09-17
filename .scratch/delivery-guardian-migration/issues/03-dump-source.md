# 03 — Freeze + dump source database

Status: needs-triage

## Context

Full copy agreed. Anon key cannot dump `auth.*` / `storage.objects`; use source `service_role` + direct Postgres connection. Freeze writes to keep wallet/order counts stable.

## Tasks

- [ ] Freeze Lovable writes (pause new orders; announce 30–60 min window).
- [ ] Record source counts: `wallet_transactions` (~132), `role_permissions` (~120), `delivery_alerts` (~101), `auth.users` (13), table count (49).
- [ ] `pg_dump` schema + data (public schema) + `auth` schema to versioned files under `/tmp/opencode/` (never commit dumps).
- [ ] Export storage inventory: 4 buckets + object counts + public/private flags.

## Verify

- Dump files non-empty; counts recorded in this file under `## Comments`.

## Depends on

- 01 (source keys), 02 (tooling).

## Comments

- 2026-09-17: Lovable export received: `docs/delivery-ace-insight_260917.backup` (826K, pg custom dump v1.16).
  Verified via string scan: 49 `COPY public.*` tables (matches dashboard's 49), incl. `merchants`, `wallet_transactions`,
  `role_permissions`, `delivery_alerts`, `modempay_webhook_events`. No `COPY auth.users` / `COPY storage.objects`
  (only policy references) — so Auth users + Storage binaries still need issues 05/06 paths. No `restaurants` data
  (legacy table, code reads `merchants`). Filename says "delivery-ace-insight" but contents are Delivery Guardian.
- 2026-09-17: NOTE — sibling `../Temistec-main` is a different project (static site + its own local Supabase on :54322).
  Do not confuse its stack/keys with Delivery Guardian.
