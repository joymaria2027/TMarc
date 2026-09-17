# 06 — Migrate auth users (13)

Status: needs-triage

## Context

13 signups. Passwords only survive via `auth` schema dump (supabase `auth.admin` export or `pg_dump` of `auth.users` with `service_role`). Client uses `brokeredPreviewStorage()` in `src/integrations/supabase/client.ts` — verify it still works against target URL.

## Tasks

- [x] Import `auth.users` + identities; preserve UUIDs (FKs from `manager_user_id`, `accountant_user_id`, `rider` rows depend on them).
  (`auth.users` 13 rows + bcrypt hashes + confirmed emails arrived in the Lovable dump with UUIDs intact; `auth.identities`
  was empty so backfilled 13 email-provider rows 2026-09-17. Script: `/tmp/opencode/auth-identities-backfill.sql`, NOT in repo.)
- [x] Confirm email-confirmation behavior (disable confirmations during import if needed, re-enable after).
  (All 13 already `email_confirmed_at` set — no confirmation mails triggered.)
- [ ] Test login for one admin, one **Merchant** manager, one rider. (Deferred to issue 08 — needs a human plaintext password.)

## Verify

- All 13 users present; 3 test logins succeed; `user_roles` / `role_permissions` joins resolve.
  (Joins verified: 0 orphan `user_roles`, 0 orphan `profiles`, 13/13 profiles. Logins pending.)

## Depends on

- 04.
