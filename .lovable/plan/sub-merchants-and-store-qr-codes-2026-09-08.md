# Sub-merchants and store QR codes

## What you get

1. **Admin grants sub-merchant rights.** On the Merchants page an admin can switch on "Can create sub-merchants" for any merchant. Only merchants with that switch on see the new option.
2. **Merchants create branches.** A permitted merchant's manager can add a sub-merchant (name, address, phone, business type, optional location). It goes live immediately; an admin can deactivate it at any time.
3. **Parent oversight.** The parent's manager can see the sub-merchant's products, orders and sales alongside their own; the sub-merchant runs its own store day to day.
4. **QR code per store.** Every merchant (parent or branch) gets a QR code pointing to its store page. From the merchant list you can view it on screen, download a PNG, and open a print-ready poster with the store name and a short instruction line.

## How it works

### Database
- Add to `merchants`: `parent_merchant_id uuid references merchants(id)` and `can_create_submerchants boolean not null default false`.
- Only admins may change `can_create_submerchants` or `parent_merchant_id` (enforced with a trigger that blocks non-admin changes to those columns).
- New insert policy: a user may insert a merchant whose `parent_merchant_id` is a merchant they manage and that has `can_create_submerchants = true`; the new row's `manager_user_id` defaults to themselves.
- Helper `public.merchant_ids_for_manager(_user_id uuid)` (security definer) returning managed merchants plus their direct children; used to widen existing manager-scoped read policies for `merchants`, `products`, `orders`, `order_items` and `merchant_tariffs` so a parent can read child data (read-only for children's rows).

### Frontend
- `MerchantsPage.tsx`: admin-only toggle column for sub-merchant permission; child merchants rendered indented under their parent; "Add sub-merchant" button shown to permitted managers, opening a create dialog.
- QR: add the `qrcode` package and a `StoreQrDialog` component rendering the QR for `${window.location.origin}/shop/m/{merchantId}` (the existing storefront route), with Download PNG and Print poster actions. Poster is a print-styled view with store name, QR and "Scan to order".
- QR entry points: merchant row action on `MerchantsPage`, and on `MerchantManagerDashboard` for each of the manager's merchants.

### Notes
- Sub-merchants reuse all existing product approval, order, dispatch and wallet logic — each has its own wallet and storefront.
- Deactivating a parent does not auto-deactivate children; that stays a separate admin action.
