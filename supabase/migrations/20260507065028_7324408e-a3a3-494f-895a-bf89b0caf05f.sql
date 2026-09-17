
-- Safe view of profiles for name lookups (no phone, no withdrawal_pin)
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker=on) AS
SELECT user_id, full_name, email, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;

-- Allow authenticated users to read names from profiles (needed by the view's security_invoker)
CREATE POLICY "Authenticated can view basic profile info"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Riders see revenue sharing rules for restaurants they're assigned to
CREATE POLICY "Riders see sharing for assigned restaurants"
ON public.revenue_sharing FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.restaurant_riders rr
    JOIN public.riders r ON r.id = rr.rider_id
    WHERE rr.restaurant_id = revenue_sharing.restaurant_id
      AND r.user_id = auth.uid()
  )
);
