
-- 1. Mirror delivery.status into orders.status when rider moves through pickup/transit/delivered
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

DROP TRIGGER IF EXISTS trg_mirror_delivery_status_to_order ON public.deliveries;
CREATE TRIGGER trg_mirror_delivery_status_to_order
AFTER UPDATE OF status ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.mirror_delivery_status_to_order();

-- 2. RPC: latest rider location for an order, restricted to authorized parties
CREATE OR REPLACE FUNCTION public.get_order_live_location(_order_id uuid)
RETURNS TABLE(
  latitude numeric,
  longitude numeric,
  recorded_at timestamptz,
  pickup_lat numeric,
  pickup_lng numeric,
  dropoff_lat numeric,
  dropoff_lng numeric,
  order_status text,
  delivery_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  authorized boolean := false;
BEGIN
  SELECT o2.id, o2.delivery_id, o2.merchant_id, o2.customer_id, o2.status,
         o2.dropoff_lat, o2.dropoff_lng
  INTO o
  FROM public.orders o2
  WHERE o2.id = _order_id;
  IF o.id IS NULL THEN RETURN; END IF;

  -- customer who placed the order
  IF EXISTS (SELECT 1 FROM public.customers c
             WHERE c.id = o.customer_id AND c.user_id = auth.uid()) THEN
    authorized := true;
  END IF;

  -- merchant manager
  IF NOT authorized AND EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = o.merchant_id AND m.manager_user_id = auth.uid()
  ) THEN authorized := true; END IF;

  -- assigned rider
  IF NOT authorized AND o.delivery_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.deliveries d
    JOIN public.riders r ON r.id = d.rider_id
    WHERE d.id = o.delivery_id AND r.user_id = auth.uid()
  ) THEN authorized := true; END IF;

  -- admin/business_owner
  IF NOT authorized AND (
    public.has_role(auth.uid(),'admin'::app_role) OR
    public.has_role(auth.uid(),'business_owner'::app_role)
  ) THEN authorized := true; END IF;

  IF NOT authorized THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT w.latitude, w.longitude, w.recorded_at,
         m.latitude, m.longitude,
         o.dropoff_lat, o.dropoff_lng,
         o.status, d.status
  FROM public.orders o2
  JOIN public.merchants m ON m.id = o2.merchant_id
  LEFT JOIN public.deliveries d ON d.id = o2.delivery_id
  LEFT JOIN LATERAL (
    SELECT w2.latitude, w2.longitude, w2.recorded_at
    FROM public.delivery_waypoints w2
    WHERE w2.delivery_id = o2.delivery_id
    ORDER BY w2.recorded_at DESC
    LIMIT 1
  ) w ON true
  WHERE o2.id = _order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_live_location(uuid) TO authenticated;

-- 3. Realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_waypoints REPLICA IDENTITY FULL;
ALTER TABLE public.order_status_events REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_waypoints; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
