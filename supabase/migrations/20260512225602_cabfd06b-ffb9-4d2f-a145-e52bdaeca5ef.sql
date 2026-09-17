-- Relax claim_delivery: allow any rider with a record to claim unassigned deliveries
CREATE OR REPLACE FUNCTION public.claim_delivery(_delivery_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_rider_id uuid;
  updated_count int;
BEGIN
  SELECT id INTO my_rider_id FROM riders
  WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not a rider';
  END IF;

  -- Auto-mark rider available so downstream availability checks succeed
  UPDATE riders SET is_active = true, is_online = true, updated_at = now()
  WHERE id = my_rider_id;

  UPDATE deliveries
  SET rider_id = my_rider_id,
      status = 'dispatched',
      dispatched_at = now()
  WHERE id = _delivery_id
    AND status = 'unassigned'
    AND rider_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$function$;

-- Replace the restrictive UPDATE policy that required is_online
DROP POLICY IF EXISTS "Active riders can claim unassigned deliveries" ON public.deliveries;

CREATE POLICY "Riders can claim unassigned deliveries"
ON public.deliveries
FOR UPDATE
USING (
  (status = 'unassigned')
  AND (rider_id IS NULL)
  AND EXISTS (SELECT 1 FROM riders r WHERE r.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM riders r WHERE r.id = deliveries.rider_id AND r.user_id = auth.uid())
);