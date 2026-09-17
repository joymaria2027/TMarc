# Block access to unapproved stores at the backend

Right now the "approved" check only happens in the app's own screens. Anyone who knows a store link can still pull that store's data directly, because the database rules allow any signed-in user to read every store row regardless of its review status, and product rows are only checked for their own approval — not their store's. This plan moves the check into the database so an unapproved branch is invisible and unusable no matter how it is reached.

## What changes for people

- A pending or rejected branch returns nothing to customers: no store details, no products, no categories, no prices. The landing page keeps showing the friendly "not open yet" notice.
- An order can never be placed against a store that is not approved and active — it is refused at the point of payment confirmation.
- Admins, the store's own manager, and the parent store's manager keep full visibility of pending branches so they can review them.

## Technical detail

### Store rows (`merchants`)
- Replace the `Authenticated users can view restaurants` policy (currently `USING (true)`) with scoped policies:
  - staff read-all: admin, accountant, business_owner, company_manager, app_developer, rider (riders need pickup details).
  - own manager / accountant read: `manager_user_id = auth.uid()` or `accountant_user_id = auth.uid()`.
  - parent manager read: existing `merchant_ids_for_manager(auth.uid())` policy stays.
  - public read: new policy for `anon` and `authenticated` limited to `approval_status = 'approved' AND is_active = true` (this also fixes anonymous shoppers, who currently have no read policy on stores at all).

### Products and related storefront tables
- Tighten `products_public_read_approved` to also require the owning store to be approved and active, via an `EXISTS` on `merchants`.
- Add the same store-approval condition to the public read policies on `product_categories`, and to `product_wholesale_pricing` / `merchant_wholesale_settings` public reads.
- Because policies now reference `merchants` from `products`, use a `SECURITY DEFINER` helper `public.merchant_is_public(_merchant_id uuid) RETURNS boolean` (stable, `search_path = public`) instead of inline subqueries, to avoid recursive-policy evaluation. Revoke execute from `PUBLIC`; grant to `anon`, `authenticated`.

### Ordering
- In `submit_order`, after loading the merchant row, raise an exception when `approval_status <> 'approved'` or `is_active = false`.
- Add a `BEFORE INSERT` check on `orders` that rejects orders whose merchant is not public, so an order cannot even be drafted against a pending branch.

### Frontend
- No behaviour change required; `StoreLandingPage` already treats a missing/unapproved store as unavailable. Verify `/shop`, `/s/:id` and `/shop/m/:id` still render for a signed-out visitor after the policy change.
