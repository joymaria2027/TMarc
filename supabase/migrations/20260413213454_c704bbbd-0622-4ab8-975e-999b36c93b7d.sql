
-- Trigger function to create alert on delivery completion
CREATE OR REPLACE FUNCTION public.notify_delivery_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rider_name TEXT;
  rest_name TEXT;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    SELECT p.full_name INTO rider_name
    FROM riders r JOIN profiles p ON p.user_id = r.user_id
    WHERE r.id = NEW.rider_id;

    SELECT name INTO rest_name FROM restaurants WHERE id = NEW.restaurant_id;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (
      NEW.id,
      'delivery_completed',
      COALESCE(rider_name, 'A rider') || ' completed delivery ' || COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8)) || ' from ' || COALESCE(rest_name, 'unknown restaurant')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_delivery_completed
AFTER UPDATE ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION public.notify_delivery_completed();

-- Allow restaurant managers and app developers to view alerts
CREATE POLICY "Restaurant managers can view alerts" ON public.delivery_alerts FOR SELECT USING (has_role(auth.uid(), 'restaurant_manager'::app_role));
CREATE POLICY "App developers can view alerts" ON public.delivery_alerts FOR SELECT USING (has_role(auth.uid(), 'app_developer'::app_role));
CREATE POLICY "Business owners can view alerts" ON public.delivery_alerts FOR SELECT USING (has_role(auth.uid(), 'business_owner'::app_role));

-- Allow restaurant managers and accountants to update alerts (resolve)
CREATE POLICY "Restaurant managers can update alerts" ON public.delivery_alerts FOR UPDATE USING (has_role(auth.uid(), 'restaurant_manager'::app_role));
CREATE POLICY "Business owners can update alerts" ON public.delivery_alerts FOR UPDATE USING (has_role(auth.uid(), 'business_owner'::app_role));
CREATE POLICY "App developers can update alerts" ON public.delivery_alerts FOR UPDATE USING (has_role(auth.uid(), 'app_developer'::app_role));
