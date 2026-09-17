# Sub-merchant approval, admin audit log, and QR landing page

## What you get

1. **Approval before a branch goes live.** A new sub-merchant is created as "Pending review". Its storefront cannot be opened or scanned until an admin approves it. Admins get a review list with Approve / Reject (with a reason), and the branch manager sees the status on the Merchants page.
2. **Admin audit log.** A new admin page records who created a sub-merchant, who approved or rejected it, and every time a store QR code is viewed, downloaded, printed, or regenerated — with time, actor and store.
3. **Scan landing page.** Scanning a store QR opens a short landing route that resolves the store and forwards to the right storefront. If the store is pending, rejected or deactivated, the customer sees a friendly "not available yet" message instead of an empty shop.

## Fix found while checking the current setup

The existing rule that lets a permitted manager create a branch compares a merchant to itself (`p.id = p.parent_merchant_id`) instead of to the chosen parent, so branch creation currently fails. This plan corrects that rule as part of the work.

## Technical detail

### Database
- `merchants`: add `approval_status text not null default 'pending'` (`pending` | `approved` | `rejected`), `rejection_reason text`, `approved_by uuid`, `approved_at timestamptz`. Backfill all existing merchants to `approved`; top-level merchants created by admins insert as `approved`.
- Trigger extension on the existing hierarchy guard: only admins may change `approval_status`, `rejection_reason`, `approved_by`, `approved_at`.
- Fix the "Managers can create sub-merchants" insert policy (`p.id = parent_merchant_id`) and require `approval_status = 'pending'` on manager-created rows.
- New `public.merchant_audit_log` (`merchant_id`, `event_type`, `actor_user_id`, `detail jsonb`, `created_at`) with GRANTs: insert for `authenticated`, select for admins and for managers of the merchant, `all` for `service_role`; no update/delete policies. Event types: `submerchant_created`, `submerchant_approved`, `submerchant_rejected`, `qr_viewed`, `qr_downloaded`, `qr_printed`, `qr_link_copied`.
- Triggers on `merchants` write `submerchant_created` / `submerchant_approved` / `submerchant_rejected` rows automatically; QR events are logged from the client.

### Frontend
- `src/pages/MerchantsPage.tsx`: status badge per row (Pending / Rejected / Live); admin Approve + Reject-with-reason actions; hide Store QR for non-approved stores.
- `src/components/StoreQrDialog.tsx`: point the encoded URL at `/s/{merchantId}` and log a `merchant_audit_log` row on open, download, print and copy.
- New `src/pages/StoreLandingPage.tsx` at route `/s/:merchantId`: looks up the store, redirects to `/shop/m/{merchantId}` when `approval_status = 'approved'` and `is_active`, otherwise shows an unavailable notice with a link back to `/shop`.
- `src/pages/MerchantStorefrontPage.tsx` and `ShopPage.tsx`: filter merchants by `approval_status = 'approved'` and `is_active` so unapproved branches never render products.
- New `src/pages/MerchantAuditLogPage.tsx` at `/admin/merchant-audit` (admin only): filterable, paginated table of audit events with store, actor name, event and detail; linked from the admin navigation.
