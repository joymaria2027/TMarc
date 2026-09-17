CREATE OR REPLACE FUNCTION public.get_rider_rejected_deliveries()
RETURNS SETOF public.deliveries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.deliveries d
  WHERE d.status NOT IN ('delivered', 'cancelled')
    AND EXISTS (
      SELECT 1
      FROM public.delivery_rejections dr
      JOIN public.riders r ON r.id = dr.rider_id
      WHERE dr.delivery_id = d.id
        AND r.user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_rider_rejected_deliveries() TO authenticated;