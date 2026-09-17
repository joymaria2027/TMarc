
-- Relax reject_delivery: allow any signed-in rider to reject (no online requirement)
CREATE OR REPLACE FUNCTION public.reject_delivery(_delivery_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_rider_id uuid;
BEGIN
  SELECT id INTO my_rider_id FROM riders
  WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not a rider';
  END IF;

  IF EXISTS (SELECT 1 FROM delivery_rejections WHERE delivery_id = _delivery_id AND rider_id = my_rider_id) THEN
    RAISE EXCEPTION 'ALREADY_REJECTED';
  END IF;

  INSERT INTO delivery_rejections (delivery_id, rider_id)
  VALUES (_delivery_id, my_rider_id);

  UPDATE deliveries
  SET rider_id = NULL,
      status = 'unassigned',
      dispatched_at = NULL
  WHERE id = _delivery_id
    AND (rider_id = my_rider_id OR rider_id IS NULL);

  RETURN true;
END;
$function$;

-- Relax get_offered_deliveries: any rider sees them (excluding self-rejected)
CREATE OR REPLACE FUNCTION public.get_offered_deliveries()
 RETURNS SETOF deliveries
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.*
  FROM deliveries d
  WHERE d.status = 'unassigned'
    AND d.rider_id IS NULL
    AND EXISTS (SELECT 1 FROM riders r WHERE r.user_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM delivery_rejections dr
      JOIN riders r ON r.id = dr.rider_id
      WHERE dr.delivery_id = d.id AND r.user_id = auth.uid()
    )
  ORDER BY d.created_at DESC;
$function$;

-- Relax SELECT RLS so any rider (online or not) can see unassigned deliveries
DROP POLICY IF EXISTS "Active riders can view unassigned deliveries" ON public.deliveries;
CREATE POLICY "Riders can view unassigned deliveries"
ON public.deliveries
FOR SELECT
USING (
  status = 'unassigned'
  AND rider_id IS NULL
  AND EXISTS (SELECT 1 FROM riders r WHERE r.user_id = auth.uid())
);
