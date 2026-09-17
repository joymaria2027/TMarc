# 02 — Local toolchain setup + link

Status: needs-triage

## Context

ZIP has both `bun.lock` and `package-lock.json`; standard is npm. `supabase/` needs CLI + Docker for 92 migrations.

## Tasks

- [ ] `node -v` (want 20.x), `npm i`, `npx supabase --version`, `docker ps`.
- [ ] `npx supabase init` (if needed) then `npx supabase link --project-ref <TARGET_REF>`.
- [ ] `npx supabase db push --dry-run` to validate 92 migrations parse (do NOT push data yet).

## Verify

- `npm run dev` boots against Lovable env (before switch); `vitest run` passes baseline.

## Depends on

- 01 (target ref for link).
