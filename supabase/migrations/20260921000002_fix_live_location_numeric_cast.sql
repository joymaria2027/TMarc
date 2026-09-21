-- Fix get_order_live_location 42804 "structure of query does not match
-- function result type" (prod 2026-09-21: every call failed, live map stuck).
--
-- delivery_waypoints.latitude/longitude and merchants.latitude/longitude are
-- DOUBLE PRECISION, but the OUT params are numeric, and plpgsql's result query
-- does not coerce float8 -> numeric. Cast the four float-sourced selects.
-- Signature and RETURNS TABLE are unchanged, so PostgREST clients,
-- generated types, and existing GRANTs are unaffected.

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
  SELECT w.latitude::numeric, w.longitude::numeric, w.recorded_at,
         m.latitude::numeric, m.longitude::numeric,
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
