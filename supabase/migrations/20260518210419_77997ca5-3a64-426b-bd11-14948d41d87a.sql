DROP POLICY IF EXISTS "Riders see own sharing" ON public.revenue_sharing;

CREATE POLICY "Riders see applicable sharing"
ON public.revenue_sharing
FOR SELECT
USING (
  -- Rule explicitly assigned to this rider
  EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = revenue_sharing.rider_id AND r.user_id = auth.uid()
  )
  -- OR generic rule (applies to any rider of that restaurant)
  OR (
    rider_id IS NULL
    AND EXISTS (SELECT 1 FROM public.riders r WHERE r.user_id = auth.uid())
  )
);