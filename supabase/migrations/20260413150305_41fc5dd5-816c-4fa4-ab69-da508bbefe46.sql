
-- Restaurant tariffs table
CREATE TABLE public.restaurant_tariffs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  tariff_amount NUMERIC NOT NULL DEFAULT 0,
  set_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tariffs" ON public.restaurant_tariffs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage tariffs" ON public.restaurant_tariffs FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Restaurant managers can insert tariffs" ON public.restaurant_tariffs FOR INSERT
WITH CHECK (has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
  SELECT 1 FROM restaurants WHERE id = restaurant_tariffs.restaurant_id AND manager_user_id = auth.uid()
));

CREATE POLICY "Restaurant managers can update tariffs" ON public.restaurant_tariffs FOR UPDATE
USING (has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
  SELECT 1 FROM restaurants WHERE id = restaurant_tariffs.restaurant_id AND manager_user_id = auth.uid()
));

-- Tariff notifications table
CREATE TABLE public.tariff_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  tariff_id UUID NOT NULL REFERENCES public.restaurant_tariffs(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  location_name TEXT NOT NULL,
  old_amount NUMERIC,
  new_amount NUMERIC NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_by UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tariff_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view tariff notifications" ON public.tariff_notifications FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Business owners can view tariff notifications" ON public.tariff_notifications FOR SELECT
USING (has_role(auth.uid(), 'business_owner'::app_role));

CREATE POLICY "App developers can view tariff notifications" ON public.tariff_notifications FOR SELECT
USING (has_role(auth.uid(), 'app_developer'::app_role));

CREATE POLICY "Admins can update tariff notifications" ON public.tariff_notifications FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Business owners can update tariff notifications" ON public.tariff_notifications FOR UPDATE
USING (has_role(auth.uid(), 'business_owner'::app_role));

CREATE POLICY "App developers can update tariff notifications" ON public.tariff_notifications FOR UPDATE
USING (has_role(auth.uid(), 'app_developer'::app_role));

-- Trigger function to auto-create notifications on tariff changes
CREATE OR REPLACE FUNCTION public.notify_tariff_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rest_name TEXT;
  msg TEXT;
  old_amt NUMERIC;
BEGIN
  SELECT name INTO rest_name FROM restaurants WHERE id = NEW.restaurant_id;
  
  IF TG_OP = 'INSERT' THEN
    msg := rest_name || ' set delivery tariff for ' || NEW.location_name || ' to ' || NEW.tariff_amount;
    old_amt := NULL;
  ELSIF TG_OP = 'UPDATE' AND OLD.tariff_amount IS DISTINCT FROM NEW.tariff_amount THEN
    msg := rest_name || ' updated tariff for ' || NEW.location_name || ' from ' || OLD.tariff_amount || ' to ' || NEW.tariff_amount;
    old_amt := OLD.tariff_amount;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO tariff_notifications (restaurant_id, tariff_id, message, location_name, old_amount, new_amount)
  VALUES (NEW.restaurant_id, NEW.id, msg, NEW.location_name, old_amt, NEW.tariff_amount);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tariff_change
AFTER INSERT OR UPDATE ON public.restaurant_tariffs
FOR EACH ROW EXECUTE FUNCTION public.notify_tariff_change();

-- Trigger for updated_at on restaurant_tariffs
CREATE TRIGGER update_restaurant_tariffs_updated_at
BEFORE UPDATE ON public.restaurant_tariffs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow restaurant managers to insert deliveries
CREATE POLICY "Restaurant managers can insert deliveries" ON public.deliveries FOR INSERT
WITH CHECK (has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
  SELECT 1 FROM restaurants WHERE id = deliveries.restaurant_id AND manager_user_id = auth.uid()
));

-- Enable realtime for tariff_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.tariff_notifications;
