-- 1. wallet_transactions order link + idempotency
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_unique_order_credit
  ON public.wallet_transactions (wallet_id, order_id)
  WHERE order_id IS NOT NULL AND type = 'credit';

-- 2. dispatch audit log
CREATE TABLE IF NOT EXISTS public.dispatch_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  delivery_id uuid,
  rider_id uuid,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dispatch_audit_log TO authenticated;
GRANT ALL ON public.dispatch_audit_log TO service_role;
ALTER TABLE public.dispatch_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_audit_read ON public.dispatch_audit_log;
CREATE POLICY dispatch_audit_read ON public.dispatch_audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'business_owner'::app_role)
    OR public.has_role(auth.uid(),'accountant'::app_role)
    OR public.has_role(auth.uid(),'app_developer'::app_role)
  );
CREATE INDEX IF NOT EXISTS dispatch_audit_order_idx ON public.dispatch_audit_log(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dispatch_audit_created_idx ON public.dispatch_audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION public.log_dispatch_event(
  _order_id uuid, _delivery_id uuid, _rider_id uuid, _event_type text, _detail jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.dispatch_audit_log (order_id, delivery_id, rider_id, event_type, detail, actor_user_id)
  VALUES (_order_id, _delivery_id, _rider_id, _event_type, COALESCE(_detail,'{}'::jsonb), auth.uid());
$$;

-- 3. merchant auto-settlement on paid order
CREATE OR REPLACE FUNCTION public.credit_merchant_for_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o RECORD; mgr uuid; w_id uuid; amt numeric;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF o IS NULL THEN RETURN; END IF;
  amt := ROUND(COALESCE(o.subtotal,0), 2);
  IF amt <= 0 THEN RETURN; END IF;

  SELECT manager_user_id INTO mgr FROM merchants WHERE id = o.merchant_id;
  SELECT id INTO w_id FROM wallets WHERE party_type = 'merchant' AND party_id = o.merchant_id LIMIT 1;
  IF w_id IS NULL THEN
    INSERT INTO wallets (party_type, party_id, user_id, merchant_id, balance)
    VALUES ('merchant', o.merchant_id, mgr, o.merchant_id, 0) RETURNING id INTO w_id;
  END IF;

  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE wallet_id = w_id AND order_id = _order_id AND type = 'credit') THEN
    RETURN;
  END IF;

  INSERT INTO wallet_transactions (wallet_id, type, amount, description, order_id)
  VALUES (w_id, 'credit', amt,
    'Product sales for order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) || ' (goods subtotal, delivery fee excluded)',
    _order_id);

  UPDATE wallets SET balance = balance + amt, updated_at = now() WHERE id = w_id;
END;
$$;

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

-- 4. audit + status mirroring
CREATE OR REPLACE FUNCTION public.audit_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_dispatch_event(NEW.id, NEW.delivery_id, NULL, 'order_status',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_order_status ON public.orders;
CREATE TRIGGER trg_audit_order_status AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_status_change();

CREATE OR REPLACE FUNCTION public.audit_delivery_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE oid uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT id INTO oid FROM orders WHERE delivery_id = NEW.id LIMIT 1;
    PERFORM public.log_dispatch_event(oid, NEW.id, NEW.rider_id, 'delivery_status',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_audit_delivery_status ON public.deliveries;
CREATE TRIGGER trg_audit_delivery_status AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.audit_delivery_status_change();

CREATE OR REPLACE FUNCTION public.mirror_delivery_status_to_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  target_order_id uuid;
  new_order_status text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  new_order_status := CASE NEW.status
    WHEN 'unassigned' THEN 'ready'
    WHEN 'dispatched' THEN 'dispatched'
    WHEN 'accepted' THEN 'dispatched'
    WHEN 'picked_up' THEN 'picked_up'
    WHEN 'in_transit' THEN 'in_transit'
    WHEN 'delivered' THEN 'delivered'
    ELSE NULL
  END;
  IF new_order_status IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO target_order_id FROM public.orders WHERE delivery_id = NEW.id LIMIT 1;
  IF target_order_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.orders
  SET status = new_order_status, updated_at = now()
  WHERE id = target_order_id
    AND status IS DISTINCT FROM new_order_status;

  RETURN NEW;
END;
$$;

-- 5. shared offer fan-out with tiered radius
CREATE OR REPLACE FUNCTION public.offer_delivery_to_pool(_order_id uuid, _delivery_id uuid, _exclude_rider uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  mrec RECORD; r RECORD; radius double precision; offered_count int := 0;
BEGIN
  SELECT m.* INTO mrec FROM merchants m JOIN orders o ON o.merchant_id = m.id WHERE o.id = _order_id;

  FOREACH radius IN ARRAY ARRAY[5::double precision, 15::double precision, 1e9::double precision]
  LOOP
    FOR r IN
      SELECT ri.id FROM riders ri
      WHERE ri.is_active = true AND ri.is_online = true
        AND (_exclude_rider IS NULL OR ri.id <> _exclude_rider)
        AND NOT EXISTS (SELECT 1 FROM delivery_rejections dr WHERE dr.delivery_id = _delivery_id AND dr.rider_id = ri.id)
        AND (mrec.latitude IS NULL OR ri.current_latitude IS NULL OR
             public.haversine_km(mrec.latitude::numeric, mrec.longitude::numeric,
                                 ri.current_latitude::numeric, ri.current_longitude::numeric) <= radius::numeric)
    LOOP
      INSERT INTO rider_dispatch_offers (order_id, delivery_id, rider_id, expires_at)
      VALUES (_order_id, _delivery_id, r.id, now() + interval '3 minutes')
      ON CONFLICT DO NOTHING;
      offered_count := offered_count + 1;
    END LOOP;
    EXIT WHEN offered_count > 0;
  END LOOP;

  PERFORM public.log_dispatch_event(_order_id, _delivery_id, NULL, 'dispatch_offered',
    jsonb_build_object('riders_offered', offered_count, 'radius_km', radius, 'excluded_rider', _exclude_rider));

  RETURN offered_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_ready(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o RECORD; mrec RECORD; d_id uuid; cust_phone TEXT; cust_name TEXT;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM merchants WHERE id = o.merchant_id AND manager_user_id = auth.uid())
          OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF o.status NOT IN ('paid','accepted','preparing') THEN
    RAISE EXCEPTION 'Order not in a ready-eligible state (current: %)', o.status;
  END IF;

  SELECT * INTO mrec FROM merchants WHERE id = o.merchant_id;
  SELECT c.full_name, c.phone INTO cust_name, cust_phone FROM customers c WHERE c.id = o.customer_id;

  IF o.fulfillment_type = 'pickup' THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'order_ready', 'Order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) || ' is ready for pickup.');
    RETURN NULL;
  END IF;

  INSERT INTO deliveries (
    merchant_id, status, customer_name, customer_phone, dropoff_address,
    dropoff_latitude, dropoff_longitude, estimated_tariff, order_reference, payment_method,
    pickup_address, pickup_latitude, pickup_longitude
  ) VALUES (
    o.merchant_id, 'unassigned', COALESCE(cust_name,'Customer'), cust_phone,
    o.dropoff_address, o.dropoff_lat, o.dropoff_lng, o.delivery_fee,
    o.order_reference, 'prepaid', mrec.address, mrec.latitude, mrec.longitude
  ) RETURNING id INTO d_id;

  UPDATE orders SET delivery_id = d_id, status = 'ready', updated_at = now() WHERE id = _order_id;

  PERFORM public.offer_delivery_to_pool(_order_id, d_id, NULL);

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (d_id, 'order_ready', 'Order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) || ' is ready — looking for a rider.');

  RETURN d_id;
END;
$$;

-- 6. rider cancels acceptance
CREATE OR REPLACE FUNCTION public.cancel_delivery_acceptance(_delivery_id uuid, _reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  my_rider_id uuid; d RECORD; oid uuid;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;

  SELECT * INTO d FROM deliveries WHERE id = _delivery_id FOR UPDATE;
  IF d IS NULL THEN RAISE EXCEPTION 'Delivery not found'; END IF;
  IF d.rider_id IS DISTINCT FROM my_rider_id THEN RAISE EXCEPTION 'Not your delivery'; END IF;
  IF d.status NOT IN ('dispatched','accepted') THEN
    RAISE EXCEPTION 'Cannot cancel after pickup (current status: %)', d.status;
  END IF;

  SELECT id INTO oid FROM orders WHERE delivery_id = _delivery_id LIMIT 1;

  UPDATE deliveries
  SET rider_id = NULL, status = 'unassigned', dispatched_at = NULL, updated_at = now()
  WHERE id = _delivery_id;

  UPDATE rider_dispatch_offers SET status = 'expired'
  WHERE delivery_id = _delivery_id AND rider_id = my_rider_id;

  INSERT INTO delivery_holder_events (delivery_id, rider_id, event_type, from_rider_id)
  VALUES (_delivery_id, my_rider_id, 'cancelled', my_rider_id);

  PERFORM public.log_dispatch_event(oid, _delivery_id, my_rider_id, 'rider_cancelled',
    jsonb_build_object('reason', NULLIF(trim(COALESCE(_reason,'')), '')));

  IF oid IS NOT NULL THEN
    PERFORM public.offer_delivery_to_pool(oid, _delivery_id, my_rider_id);
  END IF;

  RETURN true;
END;
$$;

-- 7. audit accepts and rejects
CREATE OR REPLACE FUNCTION public.claim_dispatched_order(_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o RECORD; my_rider_id uuid; claimed boolean; eligible boolean;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF o.delivery_id IS NULL THEN RAISE EXCEPTION 'Order has no delivery'; END IF;

  SELECT EXISTS (SELECT 1 FROM get_offered_orders_for_rider() g WHERE g.order_id = _order_id) INTO eligible;
  IF NOT eligible THEN RAISE EXCEPTION 'This delivery is no longer available to you'; END IF;

  claimed := claim_delivery(o.delivery_id);
  IF claimed THEN
    UPDATE rider_dispatch_offers SET status = 'claimed'
      WHERE order_id = _order_id AND rider_id = my_rider_id;
    UPDATE rider_dispatch_offers SET status = 'expired'
      WHERE order_id = _order_id AND rider_id <> my_rider_id AND status = 'offered';
    PERFORM public.log_dispatch_event(_order_id, o.delivery_id, my_rider_id, 'rider_accepted', '{}'::jsonb);
  END IF;
  RETURN claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_delivery(_delivery_id uuid, _reason text DEFAULT NULL::text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  my_rider_id uuid; oid uuid;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;

  IF EXISTS (SELECT 1 FROM delivery_rejections WHERE delivery_id = _delivery_id AND rider_id = my_rider_id) THEN
    RAISE EXCEPTION 'ALREADY_REJECTED';
  END IF;

  INSERT INTO delivery_rejections (delivery_id, rider_id, reason)
  VALUES (_delivery_id, my_rider_id, NULLIF(trim(_reason), ''));

  UPDATE deliveries
  SET rider_id = NULL, status = 'unassigned', dispatched_at = NULL
  WHERE id = _delivery_id AND (rider_id = my_rider_id OR rider_id IS NULL);

  SELECT id INTO oid FROM orders WHERE delivery_id = _delivery_id LIMIT 1;
  PERFORM public.log_dispatch_event(oid, _delivery_id, my_rider_id, 'rider_rejected',
    jsonb_build_object('reason', NULLIF(trim(COALESCE(_reason,'')), '')));

  RETURN true;
END;
$$;