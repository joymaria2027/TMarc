-- Fix foreign key relationship between riders and profiles for PostgREST joins
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'riders_user_id_profiles_fkey'
    ) THEN
        ALTER TABLE public.riders
        ADD CONSTRAINT riders_user_id_profiles_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Break infinite RLS recursion between riders and merchant_riders
CREATE OR REPLACE FUNCTION public.rider_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.riders WHERE user_id = _user_id LIMIT 1;
$$;

DROP POLICY IF EXISTS "merchant_riders_rider_select" ON public.merchant_riders;
CREATE POLICY "merchant_riders_rider_select" ON public.merchant_riders
  FOR SELECT TO authenticated
  USING (rider_id = public.rider_id_for_user(auth.uid()));

NOTIFY pgrst, 'reload schema';
