
CREATE OR REPLACE FUNCTION public.self_assign_customer_role()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'customer')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.self_assign_customer_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.self_assign_customer_role() TO authenticated;
