CREATE OR REPLACE FUNCTION public.mark_order_ready(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  mrec RECORD;
  d_id uuid;
  r RECORD;
  cust_phone TEXT;
  cust_name TEXT;
  offered_count int := 0;
  radius double precision;
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
  SELECT c.full_name, c.phone INTO cust_name, cust_phone
  FROM customers c WHERE c.id = o.customer_id;

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
    o.order_reference, 'prepaid',
    mrec.address, mrec.latitude, mrec.longitude
  ) RETURNING id INTO d_id;

  -- Order stays "ready" until a rider accepts; only link the delivery.
  UPDATE orders SET delivery_id = d_id, status = 'ready', updated_at = now() WHERE id = _order_id;

  -- Tiered dispatch: 5km -> 15km -> all online riders
  FOREACH radius IN ARRAY ARRAY[5::double precision, 15::double precision, 1e9::double precision]
  LOOP
    FOR r IN
      SELECT ri.id
      FROM riders ri
      WHERE ri.is_active = true AND ri.is_online = true
        AND (mrec.latitude IS NULL OR ri.current_latitude IS NULL OR
             public.haversine_km(mrec.latitude::numeric, mrec.longitude::numeric, ri.current_latitude::numeric, ri.current_longitude::numeric) <= radius::numeric)
    LOOP
      INSERT INTO rider_dispatch_offers (order_id, delivery_id, rider_id, expires_at)
      VALUES (_order_id, d_id, r.id, now() + interval '3 minutes')
      ON CONFLICT DO NOTHING;
      offered_count := offered_count + 1;
    END LOOP;
    EXIT WHEN offered_count > 0;
  END LOOP;

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (d_id, 'order_ready', 'Order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) || ' is ready — looking for a rider.');

  RETURN d_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mirror_delivery_status_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order_id uuid;
  new_order_status text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  new_order_status := CASE NEW.status
    WHEN 'dispatched' THEN 'dispatched'
    WHEN 'accepted' THEN 'dispatched'
    WHEN 'picked_up' THEN 'picked_up'
    WHEN 'in_transit' THEN 'in_transit'
    WHEN 'delivered' THEN 'delivered'
    ELSE NULL
  END;
  IF new_order_status IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO target_order_id FROM public.orders WHERE delivery_id = NEW.id LIMIT 1;
  IF target_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders
  SET status = new_order_status, updated_at = now()
  WHERE id = target_order_id
    AND status IS DISTINCT FROM new_order_status;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_offered_orders_for_rider()
RETURNS TABLE(delivery_id uuid, order_id uuid, order_reference text, merchant_id uuid, merchant_name text, pickup_lat numeric, pickup_lng numeric, dropoff_address text, dropoff_lat numeric, dropoff_lng numeric, estimated_tariff numeric, offered_at timestamp with time zone, expires_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT id, current_latitude, current_longitude
    FROM riders WHERE user_id = auth.uid() AND is_active = true LIMIT 1
  )
  -- direct offers
  SELECT d.id, o.id, o.order_reference, m.id, m.name,
         m.latitude::numeric, m.longitude::numeric, o.dropoff_address, o.dropoff_lat, o.dropoff_lng,
         o.delivery_fee, off.offered_at, off.expires_at
  FROM rider_dispatch_offers off
  JOIN me ON me.id = off.rider_id
  JOIN orders o ON o.id = off.order_id
  JOIN deliveries d ON d.id = off.delivery_id
  JOIN merchants m ON m.id = o.merchant_id
  WHERE off.status = 'offered'
    AND (off.expires_at IS NULL OR off.expires_at > now())
    AND d.rider_id IS NULL

  UNION

  -- widened pool: unclaimed deliveries whose offers lapsed, within 15km of the merchant
  SELECT d.id, o.id, o.order_reference, m.id, m.name,
         m.latitude::numeric, m.longitude::numeric, o.dropoff_address, o.dropoff_lat, o.dropoff_lng,
         o.delivery_fee, d.created_at, NULL::timestamptz
  FROM deliveries d
  JOIN orders o ON o.delivery_id = d.id
  JOIN merchants m ON m.id = o.merchant_id
  CROSS JOIN me
  WHERE d.rider_id IS NULL
    AND d.status = 'unassigned'
    AND NOT EXISTS (
      SELECT 1 FROM rider_dispatch_offers off2
      WHERE off2.order_id = o.id AND off2.status = 'offered'
        AND (off2.expires_at IS NULL OR off2.expires_at > now())
        AND off2.rider_id = me.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM delivery_rejections dr WHERE dr.delivery_id = d.id AND dr.rider_id = me.id
    )
    AND (m.latitude IS NULL OR me.current_latitude IS NULL OR
         public.haversine_km(m.latitude::numeric, m.longitude::numeric, me.current_latitude::numeric, me.current_longitude::numeric) <= 15);
$$;

CREATE OR REPLACE FUNCTION public.claim_dispatched_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD; my_rider_id uuid; claimed boolean; eligible boolean;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF o.delivery_id IS NULL THEN RAISE EXCEPTION 'Order has no delivery'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM get_offered_orders_for_rider() g WHERE g.order_id = _order_id
  ) INTO eligible;
  IF NOT eligible THEN
    RAISE EXCEPTION 'This delivery is no longer available to you';
  END IF;

  claimed := claim_delivery(o.delivery_id);
  IF claimed THEN
    UPDATE rider_dispatch_offers SET status = 'claimed'
      WHERE order_id = _order_id AND rider_id = my_rider_id;
    UPDATE rider_dispatch_offers SET status = 'expired'
      WHERE order_id = _order_id AND rider_id <> my_rider_id AND status = 'offered';
  END IF;
  RETURN claimed;
END;
$$;