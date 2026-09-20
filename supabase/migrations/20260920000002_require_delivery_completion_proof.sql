-- Anti-abuse: Mark Completed pays out via settlement, and the UI receipt gate
-- is bypassable via direct API. Enforce proof at the database: a delivery may
-- only transition into delivered when the run was started (picked_up_at set by
-- the Start flow) or carries an attached receipt.
-- Privileged ops roles keep a bypass for legitimate corrections; every other
-- writer (riders included) is held to the proof rule, including service_role
-- callers where auth.uid() is null.
CREATE OR REPLACE FUNCTION public.require_delivery_completion_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'app_developer'::app_role) THEN
      RETURN NEW;
    END IF;
    IF NEW.picked_up_at IS NULL AND NEW.receipt_attached IS NOT TRUE THEN
      RAISE EXCEPTION 'Delivery cannot be completed without pickup or receipt proof (delivery %)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_delivery_proof ON public.deliveries;
CREATE TRIGGER trg_require_delivery_proof
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.require_delivery_completion_proof();
