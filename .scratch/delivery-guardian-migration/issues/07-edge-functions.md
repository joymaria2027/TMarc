# 07 — Deploy edge functions + secrets

Status: needs-triage

## Context

Functions in `supabase/functions/`: `modempay-create-checkout`, `modempay-webhook` (`verify_jwt = false` in `config.toml`), `modempay-webhook-debug`, `modempay-webhook-replay`, `settlement-e2e`, plus `_shared/`. Secrets (MODEMPAY*, etc.) live in Lovable dashboard, NOT in ZIP.

## Tasks

- [x] `supabase secrets set` for each function env var (NAMES only, never values): `MODEMPAY_API_KEY` (= ModemPay sk_live),
  `MODEMPAY_WEBHOOK_SECRET` (= webhook key). `pk_live` unused in code (dashboard-side only). Set 2026-09-17, values never in repo.
- [x] Deployed `modempay-create-checkout`, `modempay-webhook` (`verify_jwt=false` preserved), `modempay-webhook-replay`
  (app-invoked from WebhookEventsPage). All ACTIVE v1. Skipped `modempay-webhook-debug` + `settlement-e2e` (dev/test helpers).
- [ ] Replay one `modempay-webhook` test event; check `WebhookEventsPage` + wallet credit. (Smoke-tested instead:
  wrong-signature POST → 401 rejected; unauthenticated checkout → 401 auth gate. Full replay needs a real ModemPay event.)

## Verify

- Functions listed on target dashboard; test webhook returns 2xx; no JWT rejection on webhook route.
  (Listed ACTIVE; webhook correctly 401s bad signatures rather than 2xx — verification working.)

## Depends on

- 04.

## Comments

- 2026-09-17: ACTION FOR OWNER — ModemPay dashboard still points webhooks at the OLD Lovable URL. Update it to
  `https://ynlbzxpgjduvpjvbnpyb.supabase.co/functions/v1/modempay-webhook` or payments never confirm on the new project.
- 2026-09-17: `callback_url` in create-checkout builds from `SUPABASE_URL` env (auto = target). No code change needed.
- Secrets were handled via transient shell env only. Rotate the shared `sbp_` token when convenient.
