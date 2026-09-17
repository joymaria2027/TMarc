
ALTER TABLE public.delivery_rejections ADD COLUMN IF NOT EXISTS reason text;

CREATE OR REPLACE FUNCTION public.reject_delivery(_delivery_id uuid, _reason text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_rider_id uuid;
BEGIN
  SELECT id INTO my_rider_id FROM riders
  WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not a rider';
  END IF;

  IF EXISTS (SELECT 1 FROM delivery_rejections WHERE delivery_id = _delivery_id AND rider_id = my_rider_id) THEN
    RAISE EXCEPTION 'ALREADY_REJECTED';
  END IF;

  INSERT INTO delivery_rejections (delivery_id, rider_id, reason)
  VALUES (_delivery_id, my_rider_id, NULLIF(trim(_reason), ''));

  UPDATE deliveries
  SET rider_id = NULL,
      status = 'unassigned',
      dispatched_at = NULL
  WHERE id = _delivery_id
    AND (rider_id = my_rider_id OR rider_id IS NULL);

  RETURN true;
END;
$function$;
