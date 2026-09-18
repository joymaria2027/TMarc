-- Block access to unapproved and inactive stores at the backend
-- Replaces open merchants read with scoped staff/manager/public policies.
-- Tightens products, categories, and wholesale pricing/settings to require store approval.
-- Adds guards in submit_order and BEFORE INSERT on orders.

-- 1. Helper function to check if a merchant is public (approved and active)
-- Uses SECURITY DEFINER with search_path = public to avoid recursive RLS evaluation.
CREATE OR REPLACE FUNCTION public.merchant_is_public(_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = _merchant_id
      AND m.approval_status = 'approved'
      AND m.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.merchant_is_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_is_public(uuid) TO anon, authenticated;

-- 2. Store rows (public.merchants)
-- Replace legacy open read policy with scoped policies
DROP POLICY IF EXISTS "Authenticated users can view restaurants" ON public.merchants;
DROP POLICY IF EXISTS "merchants_staff_read_all" ON public.merchants;
DROP POLICY IF EXISTS "merchants_manager_accountant_read_own" ON public.merchants;
DROP POLICY IF EXISTS "merchants_public_read_approved" ON public.merchants;

-- Ensure anon has select privileges on merchants
GRANT SELECT ON public.merchants TO anon;

-- Staff read-all: admin, accountant, business_owner, company_manager, app_developer, rider
CREATE POLICY "merchants_staff_read_all" ON public.merchants
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR public.has_role(auth.uid(), 'business_owner'::app_role)
    OR public.has_role(auth.uid(), 'company_manager'::app_role)
    OR public.has_role(auth.uid(), 'app_developer'::app_role)
    OR public.has_role(auth.uid(), 'rider'::app_role)
  );

-- Own manager / accountant read
CREATE POLICY "merchants_manager_accountant_read_own" ON public.merchants
  FOR SELECT TO authenticated
  USING (
    manager_user_id = auth.uid()
    OR accountant_user_id = auth.uid()
  );

-- Public read for anon and authenticated shoppers: only approved & active
CREATE POLICY "merchants_public_read_approved" ON public.merchants
  FOR SELECT TO anon, authenticated
  USING (
    approval_status = 'approved'
    AND is_active = true
  );

-- Note: Existing "Parent managers can view sub-merchants" policy using merchant_ids_for_manager(auth.uid()) stays intact.

-- 3. Products: require owning store to be approved and active
DROP POLICY IF EXISTS "products_public_read_approved" ON public.products;
CREATE POLICY "products_public_read_approved" ON public.products
  FOR SELECT TO anon, authenticated
  USING (
    approval_status = 'approved'
    AND is_active = true
    AND public.merchant_is_public(merchant_id)
  );

-- 4. Product categories: require owning store to be approved and active
DROP POLICY IF EXISTS "categories_public_read" ON public.product_categories;
CREATE POLICY "categories_public_read" ON public.product_categories
  FOR SELECT TO anon, authenticated
  USING (public.merchant_is_public(merchant_id));

-- Parent managers can view their sub-merchants' categories during review
DROP POLICY IF EXISTS "categories_parent_manager_read" ON public.product_categories;
CREATE POLICY "categories_parent_manager_read" ON public.product_categories
  FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

-- 5. Wholesale pricing and store wholesale settings: require owning store to be approved and active for wholesalers
DROP POLICY IF EXISTS "Approved wholesalers view wholesale prices" ON public.product_wholesale_pricing;
CREATE POLICY "Approved wholesalers view wholesale prices" ON public.product_wholesale_pricing
  FOR SELECT TO authenticated
  USING (
    (public.is_approved_wholesaler(auth.uid()) AND public.merchant_is_public(merchant_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );

DROP POLICY IF EXISTS "Approved wholesalers view store wholesale settings" ON public.merchant_wholesale_settings;
CREATE POLICY "Approved wholesalers view store wholesale settings" ON public.merchant_wholesale_settings
  FOR SELECT TO authenticated
  USING (
    (public.is_approved_wholesaler(auth.uid()) AND public.merchant_is_public(merchant_id))
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );

-- 6. Ordering: guard in submit_order against unapproved or inactive merchants
CREATE OR REPLACE FUNCTION public.submit_order(_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o RECORD;
  it RECORD;
  mrow RECORD;
  is_restaurant boolean;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending_payment' THEN RETURN false; END IF;

  SELECT mm.*, bt.name AS business_type_name INTO mrow
  FROM merchants mm LEFT JOIN business_types bt ON bt.id = mm.business_type_id
  WHERE mm.id = o.merchant_id;

  IF mrow IS NULL OR mrow.approval_status <> 'approved' OR mrow.is_active = false THEN
    RAISE EXCEPTION 'Merchant is not approved or inactive';
  END IF;

  is_restaurant := COALESCE(LOWER(mrow.business_type_name) LIKE '%restaurant%'
                         OR LOWER(mrow.business_type_name) LIKE '%food%', false);

  FOR it IN SELECT oi.*, p.track_inventory, p.quantity AS stock_qty, p.available_today
            FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = _order_id
  LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;
    IF is_restaurant THEN
      IF NOT COALESCE(it.available_today, true) THEN
        RAISE EXCEPTION 'Product % is not available today', it.name_snapshot;
      END IF;
    ELSIF COALESCE(it.track_inventory, true) THEN
      IF COALESCE(it.stock_qty, 0) < it.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for %', it.name_snapshot;
      END IF;
      UPDATE products SET quantity = quantity - it.quantity WHERE id = it.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = now() WHERE id = _order_id;

  PERFORM public.credit_merchant_for_order(_order_id);

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL, 'new_order',
    'New paid order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) ||
    ' for D ' || o.total || ' — please accept and prepare.');

  PERFORM public.log_dispatch_event(_order_id, NULL, NULL, 'order_paid',
    jsonb_build_object('subtotal', o.subtotal, 'total', o.total, 'merchant_id', o.merchant_id));

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_order(uuid) TO authenticated;

-- 7. Ordering: BEFORE INSERT check on orders to reject unapproved or inactive merchants
CREATE OR REPLACE FUNCTION public.check_order_merchant_is_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.merchant_is_public(NEW.merchant_id) THEN
    RAISE EXCEPTION 'Cannot place order with unapproved or inactive merchant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_order_merchant ON public.orders;
CREATE TRIGGER trg_check_order_merchant
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_merchant_is_public();
