# 04 — Restore schema + data to target

Status: needs-triage

## Context

Prefer replaying `supabase/migrations/` (92 files) on empty target for clean history, then restoring DATA only; fallback is full `pg_restore` if migration replay drifts from Lovable Cloud state.

## Tasks

- [x] On target: full `pg_restore` of Lovable export (schema + data in one shot; empty target so no replay conflicts).
- [x] Restore data dump; confirm RLS policies present (`merchant_is_public`, `merchant_ids_for_manager`, `approval_status` checks from `20260910` + `20260908` migrations).
- [x] Compare counts: 49 tables, wallet ~132, role_perm ~120, alerts ~101.

## Verify

- [x] `select count(*) from public.wallet_transactions;` etc. match source; `submit_order` rejects pending **Merchant** (see `.lovable/plan.md`).

## Depends on

- 03.

## Comments

- 2026-09-17: Restored via Session pooler (`aws-1-eu-west-1`, Session mode 5432 — direct host is IPv6-only, unreachable
  from here) using local `supabase/postgres:17.6.1` image's `pg_restore --clean --if-exists --no-owner --no-acl`.
  Result: 49 public tables; merchants=3, wallet_transactions=132, role_permissions=120, delivery_alerts=101 — exact match.
- Follow-up: `supabase link` + `migration repair` the 92 local migrations as applied (so future `db push` is clean).
- 2026-09-17 REPAIR LOG (first restore had timed out mid-run + `--no-acl` had wiped grants):
  deduped merchants/products (double-COPY), added missing PKs, selective-restored 13 missing FKs (86/86),
  applied Supabase default grants + all migration GRANT/REVOKE lines (70, chronological, 0 errors),
  re-backfilled `auth.identities`. Final: RLS 49/49, public policies 214, storage policies 25, FKs 86.
  Scripts in `/tmp/opencode/` (`grants.sql`, `migration-acls.sql`, `fk-only.list`), NOT in repo.
