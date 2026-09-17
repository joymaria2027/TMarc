# Self-owned Supabase is the system of record; Lovable Cloud is abandoned after cutover

Lovable Cloud hosted both the app and its Postgres (0.97 GB, Frankfurt) with no owner-controlled backups, secrets, or Auth config. We decided all reads/writes move to a self-owned Supabase project, with Lovable kept read-only for 7 days as rollback and then removed — because owning backups, `service_role` rotation, and edge-function secrets outweighs Lovable's convenience.

## Considered Options

- Stay on Lovable Cloud and develop against it remotely — rejected: no backup ownership, secrets live in Lovable dashboard, every local run depends on Lovable availability.
- Supabase branch-per-developer with Lovable as production — rejected: splits the system of record and doubles the RLS/secret surface during migration.

## Consequences

- Cutover requires a write freeze during dump + restore or wallet/order counts drift; rollback means re-pointing `.env` at `.env.lovable` within the 7-day window.
