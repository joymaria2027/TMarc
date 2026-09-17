REVOKE EXECUTE ON FUNCTION public.get_order_live_location(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_live_location(uuid) TO authenticated;