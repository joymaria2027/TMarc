# 01 — Create target Supabase project

Status: needs-triage

## Context

Source is Lovable-managed `zxstiyqmaixyrtggwkwn`. Need self-owned project to own backups, secrets, Auth config.
See `PRD.md` Decisions.

## Tasks

- [ ] Create new Supabase project (choose region closest to users; note ref + URL).
- [ ] Save `service_role` key + Postgres connection string for target in password manager (never commit).
- [ ] Backup current env: `cp .env .env.lovable`.
- [ ] From Lovable dashboard (screenshot: More → Cloud → Database / Secrets / Edge functions) copy source `service_role` key + Postgres connection string + function env secrets (e.g. MODEMPAY*).

## Verify

- `echo $TARGET_REF` set; target dashboard reachable; `.env.lovable` exists with `zxstiyqmaixyrtggwkwn`.

## Comments

- 2026-09-17: Lovable database export requested via dashboard (More → Cloud → Overview → Export data); awaiting export link. Storage files to be pulled separately from storage view (per Lovable dialog).
- 2026-09-17: Confirmed (Q8): pasted keys belong to the NEW self-owned target project (ref differs from ZIP `.env`). Lovable Cloud remains the export source. Target values live with owner only, never in repo.

## Depends on

- None.
