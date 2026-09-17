
-- 1. expense_types
CREATE TABLE public.expense_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  applies_to text NOT NULL DEFAULT 'rider' CHECK (applies_to IN ('rider','merchant_manager','accountant','any')),
  is_fuel boolean NOT NULL DEFAULT false,
  fuel_type text,
  price_per_litre numeric,
  cost_per_mile numeric NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX expense_types_only_one_fuel ON public.expense_types ((is_fuel)) WHERE is_fuel = true;

ALTER TABLE public.expense_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view expense types" ON public.expense_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage expense types" ON public.expense_types FOR ALL USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Accountants update fuel expense type" ON public.expense_types FOR UPDATE USING (has_role(auth.uid(),'accountant'));

CREATE TRIGGER trg_expense_types_updated BEFORE UPDATE ON public.expense_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed Fuel
INSERT INTO public.expense_types (name, is_fuel, fuel_type, cost_per_mile, applies_to)
VALUES ('Fuel', true, 'Petrol', 5, 'rider');

-- 2. fuel_price_changes
CREATE TABLE public.fuel_price_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_type_id uuid NOT NULL REFERENCES public.expense_types(id) ON DELETE CASCADE,
  old_price_per_litre numeric,
  new_price_per_litre numeric,
  old_fuel_type text,
  new_fuel_type text,
  old_cost_per_mile numeric,
  new_cost_per_mile numeric,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fuel_price_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all fuel changes" ON public.fuel_price_changes FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "Accountants view own fuel changes" ON public.fuel_price_changes FOR SELECT USING (requested_by = auth.uid());
CREATE POLICY "Accountants insert fuel change" ON public.fuel_price_changes FOR INSERT WITH CHECK (requested_by = auth.uid() AND (has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'admin')));
CREATE POLICY "Admins update fuel changes" ON public.fuel_price_changes FOR UPDATE USING (has_role(auth.uid(),'admin'));

-- 3. rider_expenses gets expense_type_id
ALTER TABLE public.rider_expenses ADD COLUMN expense_type_id uuid REFERENCES public.expense_types(id);

-- 4. deliveries odometer
ALTER TABLE public.deliveries
  ADD COLUMN start_odometer_miles numeric,
  ADD COLUMN start_odometer_photo_url text,
  ADD COLUMN start_odometer_at timestamptz,
  ADD COLUMN end_odometer_miles numeric,
  ADD COLUMN end_odometer_photo_url text,
  ADD COLUMN end_odometer_at timestamptz;

-- 5. storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('odometer-photos','odometer-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Riders upload own odometer" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'odometer-photos' AND EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1]));

CREATE POLICY "Riders read own odometer" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'odometer-photos' AND (
  EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1])
  OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'accountant') OR has_role(auth.uid(),'company_manager') OR has_role(auth.uid(),'app_developer') OR has_role(auth.uid(),'business_owner')
));

-- 6. auto fuel expense on delivered
CREATE OR REPLACE FUNCTION public.auto_fuel_expense_on_delivered()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fuel_row RECORD;
  miles numeric;
  amt numeric;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') AND NEW.rider_id IS NOT NULL THEN
    SELECT * INTO fuel_row FROM expense_types WHERE is_fuel = true AND is_active = true LIMIT 1;
    IF fuel_row IS NULL THEN RETURN NEW; END IF;

    IF NEW.start_odometer_miles IS NOT NULL AND NEW.end_odometer_miles IS NOT NULL AND NEW.end_odometer_miles >= NEW.start_odometer_miles THEN
      miles := NEW.end_odometer_miles - NEW.start_odometer_miles;
    ELSIF NEW.actual_distance_km IS NOT NULL THEN
      miles := NEW.actual_distance_km * 0.621371;
    ELSIF NEW.estimated_distance_km IS NOT NULL THEN
      miles := NEW.estimated_distance_km * 0.621371;
    ELSE
      miles := 0;
    END IF;

    amt := ROUND(miles * COALESCE(fuel_row.cost_per_mile, 5), 2);
    IF amt <= 0 THEN RETURN NEW; END IF;

    -- avoid duplicates
    IF EXISTS (SELECT 1 FROM rider_expenses WHERE rider_id = NEW.rider_id AND merchant_id = NEW.merchant_id AND expense_type_id = fuel_row.id AND description LIKE 'Auto-fuel for delivery ' || COALESCE(NEW.order_reference, LEFT(NEW.id::text,8)) || '%') THEN
      RETURN NEW;
    END IF;

    INSERT INTO rider_expenses (rider_id, merchant_id, uploaded_by, description, amount, expense_date, status, expense_type_id)
    VALUES (
      NEW.rider_id, NEW.merchant_id, NEW.rider_id,
      'Auto-fuel for delivery ' || COALESCE(NEW.order_reference, LEFT(NEW.id::text,8)) || ' (' || ROUND(miles,2) || ' mi × D' || fuel_row.cost_per_mile || '/mi)',
      amt, CURRENT_DATE, 'approved', fuel_row.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_fuel_expense
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.auto_fuel_expense_on_delivered();

-- 7. uploaded_by on rider_expenses currently NOT NULL but no FK; auto-fuel uses rider_id (uuid). That works.
