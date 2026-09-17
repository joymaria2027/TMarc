
-- Add rider_code column
ALTER TABLE public.riders ADD COLUMN rider_code TEXT UNIQUE;

-- Create a sequence for rider codes
CREATE SEQUENCE IF NOT EXISTS public.rider_code_seq START 1;

-- Backfill existing riders
DO $$
DECLARE
  r RECORD;
  seq INT;
BEGIN
  FOR r IN SELECT id FROM riders ORDER BY created_at
  LOOP
    seq := nextval('public.rider_code_seq');
    UPDATE riders SET rider_code = 'RDR-' || LPAD(seq::text, 3, '0') WHERE id = r.id;
  END LOOP;
END;
$$;

-- Make it NOT NULL after backfill
ALTER TABLE public.riders ALTER COLUMN rider_code SET NOT NULL;

-- Auto-assign rider_code on insert
CREATE OR REPLACE FUNCTION public.assign_rider_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.rider_code IS NULL THEN
    NEW.rider_code := 'RDR-' || LPAD(nextval('public.rider_code_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_rider_code
BEFORE INSERT ON public.riders
FOR EACH ROW
EXECUTE FUNCTION public.assign_rider_code();
