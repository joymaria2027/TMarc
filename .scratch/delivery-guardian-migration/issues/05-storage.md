# 05 — Migrate storage (4 buckets)

Status: needs-triage

## Context

Buckets: `product-images`, `reconciliation-statements`, `odometer-photos`, `receipts`. Receipt/odometer photos are load-bearing for Reconciliation + Deliveries flows.

## Tasks

- [x] Recreate 4 buckets on target with same public/private flags. (Buckets + `storage.objects` rows arrived inside the Lovable dump:
  product-images 7, odometer-photos 7, receipts 2 objects; recon-statements 0. Extra `database_export_17_09_26` bucket is
  Lovable's export staging — leave alone.)
- [x] Sync object BINARIES — 16/16, byte-verified 2026-09-17 (service_role, x-upsert):
  product-images 7/7 (filename-matched to merchant folders), receipts 2/2 (filename-matched),
  odometer-photos 7/7 (arbitrary mapping — see Comments).
- [x] Verify RLS/policies on `storage.objects` match source. (Dump carried 0 policies; replayed 23 from migrations in order:
  receipts 8, odometer 2, recon 7, product-images 6. Script: `/tmp/opencode/storage-policies.sql`, NOT in repo.)
- [x] Verify RLS/policies on `storage.objects` match source. (Dump carried 0 policies; replayed 23 from migrations in order:
  receipts 8, odometer 2, recon 7, product-images 6. Script: `/tmp/opencode/storage-policies.sql`, NOT in repo.)

## Verify

- Per-bucket object counts match; sample public URL + signed URL load; `ProductDetailPage` images render.

## Depends on

- 04.

## Comments

- 2026-09-17: receipts bucket: set public=true (Q9), then REVERTED to private (false) after Lovable dashboard screenshot
  proved live source is Private on all buckets. Migration `20260414` says public=true but source was later flipped in
  dashboard — target now matches source exactly. Follow-up bug (post-cutover): `ReceiptUpload getPublicUrl` 403s against
  a private bucket, so receipt images are likely broken on Lovable today too — fix is signed URLs, separate issue.
- 2026-09-17: odometer mapping: inspected all 7 photos — none show an odometer (wooden desk/cable-grommet test shots),
  so delivery-folder mapping is unknowable AND immaterial (no mileage evidence in any file). Uploaded sorted→sorted;
  all rows resolve (no 404s). If real odometer enforcement is wanted later, that's a product decision (require a readable
  dial photo at capture), not migration work.
