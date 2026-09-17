
-- Remove the overly permissive policy
DROP POLICY IF EXISTS "Authenticated can view basic profile info" ON public.profiles;

-- Recreate the view as SECURITY DEFINER so it can read base table while RLS still hides PII via direct access
DROP VIEW IF EXISTS public.public_profiles;

CREATE OR REPLACE FUNCTION public.get_public_profiles()
RETURNS TABLE(user_id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, full_name, email, avatar_url FROM public.profiles;
$$;

REVOKE ALL ON FUNCTION public.get_public_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated;
