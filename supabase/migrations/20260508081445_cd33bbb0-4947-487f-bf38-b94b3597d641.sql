
CREATE OR REPLACE FUNCTION public.claim_delivery(_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_rider_id uuid;
  updated_count int;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not an active rider';
  END IF;

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
$$;

DROP POLICY IF EXISTS "Active riders can view revenue sharing" ON public.revenue_sharing;
CREATE POLICY "Active riders can view revenue sharing"
ON public.revenue_sharing
FOR SELECT
USING (
  EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND is_active = true)
);
