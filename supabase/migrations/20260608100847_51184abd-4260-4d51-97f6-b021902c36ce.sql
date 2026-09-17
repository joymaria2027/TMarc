
-- 1. Add 'customer' role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

-- 2. product_categories
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.product_categories FOR SELECT USING (true);
CREATE POLICY "categories_merchant_manage" ON public.product_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()) OR has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()) OR has_role(auth.uid(),'admin'));

-- 3. products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_path TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'GMD',
  quantity INT NOT NULL DEFAULT 0,
  track_inventory BOOLEAN NOT NULL DEFAULT true,
  available_today BOOLEAN NOT NULL DEFAULT true,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read_approved" ON public.products FOR SELECT
  USING (approval_status = 'approved' AND is_active = true);
CREATE POLICY "products_merchant_read_own" ON public.products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));
CREATE POLICY "products_staff_read_all" ON public.products FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'business_owner'));
CREATE POLICY "products_merchant_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));
CREATE POLICY "products_merchant_update" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));
CREATE POLICY "products_admin_update" ON public.products FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "products_merchant_delete" ON public.products FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));

CREATE INDEX idx_products_merchant ON public.products(merchant_id);
CREATE INDEX idx_products_approval ON public.products(approval_status);

-- 4. customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  default_address TEXT,
  default_lat NUMERIC,
  default_lng NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_self_rw" ON public.customers FOR ALL TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(),'admin'));

-- 5. customer_addresses
CREATE TABLE public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label TEXT,
  address TEXT NOT NULL,
  lat NUMERIC,
  lng NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customer_addr_self" ON public.customer_addresses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()));

-- 6. orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_reference TEXT UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('pickup','delivery')),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN
    ('pending_payment','paid','accepted','preparing','ready','dispatched','delivered','cancelled','refunded')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GMD',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  payment_provider TEXT,
  payment_reference TEXT,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  dropoff_address TEXT,
  dropoff_lat NUMERIC,
  dropoff_lng NUMERIC,
  customer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_customer_rw" ON public.orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM customers c WHERE c.id = customer_id AND c.user_id = auth.uid()));
CREATE POLICY "orders_merchant_read" ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));
CREATE POLICY "orders_merchant_update" ON public.orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM merchants m WHERE m.id = merchant_id AND m.manager_user_id = auth.uid()));
CREATE POLICY "orders_staff_all" ON public.orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'business_owner'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'business_owner'));

CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_merchant ON public.orders(merchant_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- 7. order_items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  name_snapshot TEXT NOT NULL,
  price_snapshot NUMERIC(12,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_via_order" ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_id AND (
      EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM merchants m WHERE m.id = o.merchant_id AND m.manager_user_id = auth.uid())
      OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'business_owner')
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_id AND (
      EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM merchants m WHERE m.id = o.merchant_id AND m.manager_user_id = auth.uid())
      OR has_role(auth.uid(),'admin')
    )
  ));

-- 8. order_status_events
CREATE TABLE public.order_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID,
  note TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_status_events TO authenticated;
GRANT ALL ON public.order_status_events TO service_role;
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_events_read" ON public.order_status_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_id AND (
      EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id AND c.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM merchants m WHERE m.id = o.merchant_id AND m.manager_user_id = auth.uid())
      OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'business_owner')
    )
  ));

-- 9. rider_dispatch_offers
CREATE TABLE public.rider_dispatch_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','claimed','expired','skipped')),
  UNIQUE(order_id, rider_id)
);
GRANT SELECT, UPDATE ON public.rider_dispatch_offers TO authenticated;
GRANT ALL ON public.rider_dispatch_offers TO service_role;
ALTER TABLE public.rider_dispatch_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatch_offers_rider_read" ON public.rider_dispatch_offers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM riders r WHERE r.id = rider_id AND r.user_id = auth.uid())
         OR has_role(auth.uid(),'admin'));

-- 10. updated_at triggers
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Order reference auto-assign
CREATE SEQUENCE IF NOT EXISTS public.order_ref_seq;
CREATE OR REPLACE FUNCTION public.assign_order_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.order_reference IS NULL THEN
    NEW.order_reference := 'ORD-' || LPAD(nextval('public.order_ref_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_orders_ref BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_reference();

-- 12. Status event logger
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_events(order_id, from_status, to_status, actor_user_id)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_events(order_id, from_status, to_status, actor_user_id)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_orders_log_status AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- 13. Customer auto-create on customer-role signup
CREATE OR REPLACE FUNCTION public.ensure_customer_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.role = 'customer' THEN
    SELECT full_name, email INTO p FROM profiles WHERE user_id = NEW.user_id LIMIT 1;
    INSERT INTO customers (user_id, full_name)
    VALUES (NEW.user_id, COALESCE(p.full_name, ''))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_role_customer AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_customer_row();

-- 14. submit_order — called after payment confirmed
CREATE OR REPLACE FUNCTION public.submit_order(_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD;
  it RECORD;
  m RECORD;
  is_restaurant boolean;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending_payment' THEN RETURN false; END IF;

  SELECT m.*, bt.name AS business_type_name INTO m
  FROM merchants m LEFT JOIN business_types bt ON bt.id = m.business_type_id
  WHERE m.id = o.merchant_id;
  is_restaurant := COALESCE(LOWER(m.business_type_name) LIKE '%restaurant%' OR LOWER(m.business_type_name) LIKE '%food%', false);

  -- stock check + decrement
  FOR it IN SELECT oi.*, p.track_inventory, p.quantity, p.available_today
            FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = _order_id
  LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;
    IF is_restaurant THEN
      IF NOT COALESCE(it.available_today, true) THEN
        RAISE EXCEPTION 'Product % is not available today', it.name_snapshot;
      END IF;
    ELSIF COALESCE(it.track_inventory, true) THEN
      IF COALESCE(it.quantity,0) < it.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for %', it.name_snapshot;
      END IF;
      UPDATE products SET quantity = quantity - it.quantity WHERE id = it.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = now() WHERE id = _order_id;

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL, 'new_order',
    'New paid order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) ||
    ' for D ' || o.total || ' — please accept and prepare.');

  RETURN true;
END;
$$;

-- 15. Haversine helper
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT 6371 * 2 * asin(sqrt(
    sin(radians((lat2-lat1)/2))^2 +
    cos(radians(lat1))*cos(radians(lat2))*sin(radians((lon2-lon1)/2))^2
  ));
$$;

-- 16. mark_order_ready — merchant flips order to ready; for delivery, creates a delivery + offers
CREATE OR REPLACE FUNCTION public.mark_order_ready(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD;
  m RECORD;
  d_id uuid;
  r RECORD;
  customer_phone TEXT;
  customer_name TEXT;
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

  SELECT * INTO m FROM merchants WHERE id = o.merchant_id;
  SELECT c.full_name, c.phone INTO customer_name, customer_phone
  FROM customers c WHERE c.id = o.customer_id;

  IF o.fulfillment_type = 'pickup' THEN
    UPDATE orders SET status = 'ready', updated_at = now() WHERE id = _order_id;
    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'order_ready', 'Order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) || ' is ready for pickup.');
    RETURN NULL;
  END IF;

  -- delivery flow
  INSERT INTO deliveries (
    merchant_id, status, customer_name, customer_phone, dropoff_address,
    dropoff_latitude, dropoff_longitude, estimated_tariff, order_reference, payment_method
  ) VALUES (
    o.merchant_id, 'unassigned', COALESCE(customer_name,'Customer'), customer_phone,
    o.dropoff_address, o.dropoff_lat, o.dropoff_lng, o.delivery_fee,
    o.order_reference, 'prepaid'
  ) RETURNING id INTO d_id;

  UPDATE orders SET delivery_id = d_id, status = 'dispatched', updated_at = now() WHERE id = _order_id;

  -- assigned riders first (merchant_riders mapping)
  FOR r IN
    SELECT DISTINCT ri.id, ri.current_latitude, ri.current_longitude
    FROM riders ri
    JOIN merchant_riders mr ON mr.rider_id = ri.id
    WHERE mr.merchant_id = o.merchant_id
      AND ri.is_active = true AND ri.is_online = true
      AND (m.latitude IS NULL OR ri.current_latitude IS NULL OR
           public.haversine_km(m.latitude, m.longitude, ri.current_latitude, ri.current_longitude) <= 5)
  LOOP
    INSERT INTO rider_dispatch_offers (order_id, delivery_id, rider_id, expires_at)
    VALUES (_order_id, d_id, r.id, now() + interval '3 minutes')
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN d_id;
END;
$$;

-- 17. widen_dispatch_pool — extend to 15km after timeout
CREATE OR REPLACE FUNCTION public.widen_dispatch_pool(_order_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD; m RECORD; r RECORD; added int := 0;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF o IS NULL OR o.delivery_id IS NULL THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM rider_dispatch_offers WHERE order_id = _order_id AND status = 'claimed') THEN
    RETURN 0;
  END IF;

  SELECT * INTO m FROM merchants WHERE id = o.merchant_id;

  FOR r IN
    SELECT ri.id, ri.current_latitude, ri.current_longitude
    FROM riders ri
    WHERE ri.is_active = true AND ri.is_online = true
      AND (m.latitude IS NULL OR ri.current_latitude IS NULL OR
           public.haversine_km(m.latitude, m.longitude, ri.current_latitude, ri.current_longitude) <= 15)
  LOOP
    INSERT INTO rider_dispatch_offers (order_id, delivery_id, rider_id, expires_at)
    VALUES (_order_id, o.delivery_id, r.id, now() + interval '10 minutes')
    ON CONFLICT DO NOTHING;
    added := added + 1;
  END LOOP;
  RETURN added;
END;
$$;

-- 18. get_offered_orders_for_rider — only deliveries the rider was offered, with PII masked
CREATE OR REPLACE FUNCTION public.get_offered_orders_for_rider()
RETURNS TABLE (
  delivery_id uuid, order_id uuid, order_reference text, merchant_id uuid,
  merchant_name text, pickup_lat numeric, pickup_lng numeric,
  dropoff_address text, dropoff_lat numeric, dropoff_lng numeric,
  estimated_tariff numeric, offered_at timestamptz, expires_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, o.id, o.order_reference, m.id, m.name,
         m.latitude, m.longitude, o.dropoff_address, o.dropoff_lat, o.dropoff_lng,
         o.delivery_fee, off.offered_at, off.expires_at
  FROM rider_dispatch_offers off
  JOIN riders r ON r.id = off.rider_id AND r.user_id = auth.uid()
  JOIN orders o ON o.id = off.order_id
  JOIN deliveries d ON d.id = off.delivery_id
  JOIN merchants m ON m.id = o.merchant_id
  WHERE off.status = 'offered'
    AND (off.expires_at IS NULL OR off.expires_at > now())
    AND d.rider_id IS NULL;
$$;

-- 19. claim_dispatched_order — wraps claim_delivery and expires other offers
CREATE OR REPLACE FUNCTION public.claim_dispatched_order(_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o RECORD; my_rider_id uuid; claimed boolean;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;
  SELECT * INTO o FROM orders WHERE id = _order_id;
  IF o.delivery_id IS NULL THEN RAISE EXCEPTION 'Order has no delivery'; END IF;

  IF NOT EXISTS (SELECT 1 FROM rider_dispatch_offers
                 WHERE order_id = _order_id AND rider_id = my_rider_id AND status = 'offered') THEN
    RAISE EXCEPTION 'Not offered to you';
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

-- 20. signed-url helper for product images (returns the storage path; client fetches signed URL)
-- Storage policies for product-images bucket
CREATE POLICY "product_images_authenticated_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');
CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'product-images');
CREATE POLICY "product_images_merchant_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "product_images_merchant_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images');
CREATE POLICY "product_images_merchant_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');
