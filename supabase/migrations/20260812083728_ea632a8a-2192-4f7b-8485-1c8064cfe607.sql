REVOKE EXECUTE ON FUNCTION public.log_dispatch_event(uuid, uuid, uuid, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_merchant_for_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.offer_delivery_to_pool(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_delivery_acceptance(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_ready(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_order(uuid) FROM anon;