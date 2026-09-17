
-- 1. Tighten rider delivery insert policy to require merchant linkage
DROP POLICY IF EXISTS "Riders can insert deliveries" ON public.deliveries;

CREATE POLICY "Riders can insert deliveries"
ON public.deliveries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = deliveries.rider_id
      AND r.user_id = auth.uid()
  )
  AND (
    deliveries.merchant_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.merchant_riders mr
      JOIN public.riders r2 ON r2.id = mr.rider_id
      WHERE mr.merchant_id = deliveries.merchant_id
        AND r2.user_id = auth.uid()
    )
  )
);

-- 2. Prevent any direct SELECT on profiles.withdrawal_pin via Data API.
-- The SECURITY DEFINER functions (verify_withdrawal_pin, has_withdrawal_pin,
-- set_withdrawal_pin) bypass these column grants since they run as owner.
REVOKE SELECT (withdrawal_pin) ON public.profiles FROM authenticated;
REVOKE SELECT (withdrawal_pin) ON public.profiles FROM anon;
REVOKE UPDATE (withdrawal_pin) ON public.profiles FROM authenticated;
REVOKE UPDATE (withdrawal_pin) ON public.profiles FROM anon;
