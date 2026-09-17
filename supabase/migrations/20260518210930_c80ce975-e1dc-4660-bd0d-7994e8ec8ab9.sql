DROP POLICY IF EXISTS "Riders see applicable sharing" ON public.revenue_sharing;
DROP POLICY IF EXISTS "Riders see own sharing" ON public.revenue_sharing;

CREATE POLICY "Riders see own sharing"
ON public.revenue_sharing
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = revenue_sharing.rider_id AND r.user_id = auth.uid()
  )
);