-- 1. fuel_variants table
CREATE TABLE public.fuel_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_type_id uuid NOT NULL REFERENCES public.expense_types(id) ON DELETE CASCADE,
  fuel_type text NOT NULL,
  price_per_litre numeric,
  cost_per_mile numeric NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_type_id, fuel_type)
);

-- Only one default per expense_type
CREATE UNIQUE INDEX fuel_variants_one_default_per_type
  ON public.fuel_variants(expense_type_id) WHERE is_default;

CREATE TRIGGER trg_fuel_variants_updated
BEFORE UPDATE ON public.fuel_variants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fuel_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view fuel variants"
ON public.fuel_variants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage fuel variants"
ON public.fuel_variants FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants update fuel variants"
ON public.fuel_variants FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role));

-- 2. Backfill from existing Fuel expense_type rows
INSERT INTO public.fuel_variants (expense_type_id, fuel_type, price_per_litre, cost_per_mile, is_active, is_default)
SELECT id, COALESCE(fuel_type, 'Petrol'), price_per_litre, COALESCE(cost_per_mile, 5), is_active, true
FROM public.expense_types
WHERE is_fuel = true
ON CONFLICT (expense_type_id, fuel_type) DO NOTHING;

-- 3. riders gain fuel_variant_id
ALTER TABLE public.riders
  ADD COLUMN fuel_variant_id uuid REFERENCES public.fuel_variants(id) ON DELETE SET NULL;

-- 4. fuel_price_changes gains fuel_variant_id
ALTER TABLE public.fuel_price_changes
  ADD COLUMN fuel_variant_id uuid REFERENCES public.fuel_variants(id) ON DELETE CASCADE;

-- 5. Replace trigger function to use variants
CREATE OR REPLACE FUNCTION public.auto_fuel_expense_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fuel_type_row RECORD;
  variant RECORD;
  miles numeric;
  amt numeric;
  rate numeric;
  label text;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') AND NEW.rider_id IS NOT NULL THEN
    SELECT * INTO fuel_type_row FROM expense_types WHERE is_fuel = true AND is_active = true LIMIT 1;
    IF fuel_type_row IS NULL THEN RETURN NEW; END IF;

    -- Resolve variant: rider's assigned, then default, then legacy
    SELECT fv.* INTO variant
    FROM fuel_variants fv
    JOIN riders r ON r.fuel_variant_id = fv.id
    WHERE r.id = NEW.rider_id AND fv.is_active = true
    LIMIT 1;

    IF variant.id IS NULL THEN
      SELECT * INTO variant FROM fuel_variants
      WHERE expense_type_id = fuel_type_row.id AND is_default = true AND is_active = true
      LIMIT 1;
    END IF;

    IF variant.id IS NOT NULL THEN
      rate := COALESCE(variant.cost_per_mile, 5);
      label := variant.fuel_type;
    ELSE
      rate := COALESCE(fuel_type_row.cost_per_mile, 5);
      label := COALESCE(fuel_type_row.fuel_type, 'Fuel');
    END IF;

    IF NEW.start_odometer_miles IS NOT NULL AND NEW.end_odometer_miles IS NOT NULL AND NEW.end_odometer_miles >= NEW.start_odometer_miles THEN
      miles := NEW.end_odometer_miles - NEW.start_odometer_miles;
    ELSIF NEW.actual_distance_km IS NOT NULL THEN
      miles := NEW.actual_distance_km * 0.621371;
    ELSIF NEW.estimated_distance_km IS NOT NULL THEN
      miles := NEW.estimated_distance_km * 0.621371;
    ELSE
      miles := 0;
    END IF;

    amt := ROUND(miles * rate, 2);
    IF amt <= 0 THEN RETURN NEW; END IF;

    IF EXISTS (SELECT 1 FROM rider_expenses WHERE rider_id = NEW.rider_id AND merchant_id = NEW.merchant_id AND expense_type_id = fuel_type_row.id AND description LIKE 'Auto-fuel for delivery ' || COALESCE(NEW.order_reference, LEFT(NEW.id::text,8)) || '%') THEN
      RETURN NEW;
    END IF;

    INSERT INTO rider_expenses (rider_id, merchant_id, uploaded_by, description, amount, expense_date, status, expense_type_id)
    VALUES (
      NEW.rider_id, NEW.merchant_id, NEW.rider_id,
      'Auto-fuel for delivery ' || COALESCE(NEW.order_reference, LEFT(NEW.id::text,8)) || ' (' || label || ', ' || ROUND(miles,2) || ' mi × D' || rate || '/mi)',
      amt, CURRENT_DATE, 'approved', fuel_type_row.id
    );
  END IF;
  RETURN NEW;
END;
$function$;