-- Payment security hardening (audit-remediation issues 01 + 02)
--
-- 01: submit_order was callable by ANY authenticated user and marked orders paid
--     with no proof of payment (free-order bypass). It also called the two-arg
--     credit_merchant_for_order with one argument, which throws at runtime.
--     Postgres grants EXECUTE to PUBLIC by default, so earlier REVOKEs from
--     anon/authenticated never actually locked these functions down.
-- 02: orders_customer_rw was a FOR ALL policy, letting customers rewrite their
--     own order's subtotal/total/payment_status. Clients never UPDATE orders
--     (checkout is insert-only), so customer UPDATE access is removed outright.

-- 1. Server-side record of confirmed payments (written only by the payment
--    webhook via the service-role client; invisible to PostgREST clients).
CREATE TABLE IF NOT EXISTS public.order_payment_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'modempay',
  payment_reference TEXT,
  verified_amount NUMERIC(12,2) NOT NULL CHECK (verified_amount >= 0),
  amount_covers_order BOOLEAN NOT NULL DEFAULT false,
  source_event_id TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, provider)
);
ALTER TABLE public.order_payment_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_payment_verifications FROM PUBLIC;
REVOKE ALL ON public.order_payment_verifications FROM anon, authenticated;
GRANT ALL ON public.order_payment_verifications TO service_role;

-- 2. submit_order: service-role only, and only after a verified payment that
--    covers the order total. Blocks tampered/stale price snapshots before any
--    stock decrement or wallet credit.
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

  -- Payment must have been confirmed by the payment webhook (service-role writer).
  IF NOT EXISTS (
    SELECT 1 FROM public.order_payment_verifications v
    WHERE v.order_id = _order_id
      AND v.amount_covers_order = true
  ) THEN
    RAISE EXCEPTION 'Payment for this order has not been confirmed';
  END IF;

  SELECT mm.*, bt.name AS business_type_name INTO mrow
  FROM merchants mm LEFT JOIN business_types bt ON bt.id = mm.business_type_id
  WHERE mm.id = o.merchant_id;

  IF mrow IS NULL OR mrow.approval_status <> 'approved' OR mrow.is_active = false THEN
    RAISE EXCEPTION 'Merchant is not approved or inactive';
  END IF;

  is_restaurant := COALESCE(LOWER(mrow.business_type_name) LIKE '%restaurant%'
                         OR LOWER(mrow.business_type_name) LIKE '%food%', false);

  FOR it IN SELECT oi.*, p.track_inventory, p.quantity AS stock_qty, p.available_today,
                   p.price AS current_price, p.is_active AS product_is_active
            FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = _order_id
  LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;

    -- Client-authored snapshots are untrusted: line math must be internally
    -- consistent and each price must still match the merchant's catalog price.
    IF ABS(it.line_total - (it.price_snapshot * it.quantity)) > 0.009 THEN
      RAISE EXCEPTION 'Order price data is stale or tampered';
    END IF;
    IF it.product_is_active IS NOT NULL AND NOT it.product_is_active THEN
      RAISE EXCEPTION 'Product % is no longer available', it.name_snapshot;
    END IF;
    IF ABS(COALESCE(it.current_price, it.price_snapshot) - it.price_snapshot) > 0.009 THEN
      RAISE EXCEPTION 'Order price data is stale or tampered';
    END IF;

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

  -- Totals must equal the sum of line totals (catches a rewritten order.total).
  IF ABS(COALESCE(o.subtotal, 0) - (
       SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = _order_id
     )) > 0.009 THEN
    RAISE EXCEPTION 'Order price data is stale or tampered';
  END IF;

  UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = now() WHERE id = _order_id;

  PERFORM public.credit_merchant_for_order(_order_id, 'live');

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL, 'new_order',
    'New paid order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) ||
    ' for D ' || o.total || ' — please accept and prepare.');

  PERFORM public.log_dispatch_event(_order_id, NULL, NULL, 'order_paid',
    jsonb_build_object('subtotal', o.subtotal, 'total', o.total, 'merchant_id', o.merchant_id));

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_order(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_order(uuid) TO service_role;

-- 3. Close the default PUBLIC execute grant left open by prior migrations.
REVOKE EXECUTE ON FUNCTION public.credit_merchant_for_order(uuid, text) FROM PUBLIC;

-- 4. Customers create and read their orders; they never UPDATE them (money and
--    status fields are server-authoritative via webhook + staff/DB functions).
DROP POLICY IF EXISTS "orders_customer_rw" ON public.orders;
CREATE POLICY "orders_customer_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()));
CREATE POLICY "orders_customer_select" ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()));
