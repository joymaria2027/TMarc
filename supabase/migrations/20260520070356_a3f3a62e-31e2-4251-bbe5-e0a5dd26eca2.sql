CREATE OR REPLACE FUNCTION public.get_rider_rejected_deliveries()
RETURNS SETOF public.deliveries
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.*
  FROM public.deliveries d
  WHERE d.status NOT IN ('delivered','cancelled')
    AND EXISTS (SELECT 1 FROM public.delivery_rejections dr WHERE dr.delivery_id = d.id)
    AND EXISTS (SELECT 1 FROM public.riders r WHERE r.user_id = auth.uid());
$$;