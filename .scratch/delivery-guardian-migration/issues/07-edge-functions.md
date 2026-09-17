# 07 — Deploy edge functions + secrets

Status: needs-triage

## Context

Functions in `supabase/functions/`: `modempay-create-checkout`, `modempay-webhook` (`verify_jwt = false` in `config.toml`), `modempay-webhook-debug`, `modempay-webhook-replay`, `settlement-e2e`, plus `_shared/`. Secrets (MODEMPAY*, etc.) live in Lovable dashboard, NOT in ZIP.

## Tasks

- [ ] `npx supabase secrets set` for each function env var from Lovable (list them in `## Comments` as NAMES only, never values).
- [ ] `npx supabase functions deploy modempay-create-checkout modempay-webhook settlement-e2e` (+ debug/replay if needed).
- [ ] Replay one `modempay-webhook` test event; check `WebhookEventsPage` + wallet credit.

## Verify

- Functions listed on target dashboard; test webhook returns 2xx; no JWT rejection on webhook route.

## Depends on

- 04.

## Comments
