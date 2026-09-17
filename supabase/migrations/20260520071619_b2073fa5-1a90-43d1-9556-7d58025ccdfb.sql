CREATE OR REPLACE FUNCTION public.reclaim_delivery(_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_rider_id uuid;
  prev_rider_id uuid;
  cur_status text;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not a rider';
  END IF;

  SELECT rider_id, status INTO prev_rider_id, cur_status
  FROM deliveries WHERE id = _delivery_id FOR UPDATE;

  IF cur_status IS NULL THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF cur_status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Delivery already %', cur_status;
  END IF;

  IF prev_rider_id = my_rider_id THEN
    RETURN false;
  END IF;

  UPDATE riders SET is_active = true, is_online = true, updated_at = now()
  WHERE id = my_rider_id;

  IF prev_rider_id IS NOT NULL THEN
    INSERT INTO delivery_rejections (delivery_id, rider_id, reason)
    VALUES (_delivery_id, prev_rider_id, 'Reassigned to another rider')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE deliveries
  SET rider_id = my_rider_id,
      status = 'dispatched',
      dispatched_at = COALESCE(dispatched_at, now()),
      updated_at = now()
  WHERE id = _delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclaim_delivery(uuid) TO authenticated;