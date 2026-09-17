
-- 1) History table
CREATE TABLE IF NOT EXISTS public.delivery_holder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('claimed','reassigned_from','released')),
  from_rider_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dhe_delivery ON public.delivery_holder_events(delivery_id, created_at DESC);

ALTER TABLE public.delivery_holder_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all holder events"
  ON public.delivery_holder_events FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'app_developer')
         OR has_role(auth.uid(),'business_owner') OR has_role(auth.uid(),'accountant'));

CREATE POLICY "Managers view own merchant holder events"
  ON public.delivery_holder_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM deliveries d JOIN merchants m ON m.id = d.merchant_id
    WHERE d.id = delivery_holder_events.delivery_id AND m.manager_user_id = auth.uid()
  ));

CREATE POLICY "Riders view relevant holder events"
  ON public.delivery_holder_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM riders r
    WHERE r.user_id = auth.uid()
      AND (
        r.id = delivery_holder_events.rider_id
        OR r.id = delivery_holder_events.from_rider_id
        OR EXISTS (SELECT 1 FROM delivery_rejections dr WHERE dr.delivery_id = delivery_holder_events.delivery_id AND dr.rider_id = r.id)
        OR EXISTS (SELECT 1 FROM deliveries d WHERE d.id = delivery_holder_events.delivery_id AND d.rider_id = r.id)
      )
  ));

-- 2) claim_delivery: log 'claimed'
CREATE OR REPLACE FUNCTION public.claim_delivery(_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  my_rider_id uuid;
  updated_count int;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;

  UPDATE riders SET is_active = true, is_online = true, updated_at = now() WHERE id = my_rider_id;

  UPDATE deliveries
  SET rider_id = my_rider_id, status = 'dispatched', dispatched_at = now()
  WHERE id = _delivery_id AND status = 'unassigned' AND rider_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count > 0 THEN
    INSERT INTO delivery_holder_events (delivery_id, rider_id, event_type)
    VALUES (_delivery_id, my_rider_id, 'claimed');
  END IF;

  RETURN updated_count > 0;
END;
$$;

-- 3) reclaim_delivery: only allow when status='dispatched' (claimed but not accepted)
CREATE OR REPLACE FUNCTION public.reclaim_delivery(_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  my_rider_id uuid;
  prev_rider_id uuid;
  cur_status text;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() LIMIT 1;
  IF my_rider_id IS NULL THEN RAISE EXCEPTION 'Not a rider'; END IF;

  SELECT rider_id, status INTO prev_rider_id, cur_status
  FROM deliveries WHERE id = _delivery_id FOR UPDATE;

  IF cur_status IS NULL THEN RAISE EXCEPTION 'Delivery not found'; END IF;

  IF cur_status IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Delivery already %', cur_status;
  END IF;

  -- Lock once another rider has accepted/started the delivery
  IF cur_status NOT IN ('unassigned','dispatched') THEN
    RAISE EXCEPTION 'DELIVERY_LOCKED';
  END IF;

  IF prev_rider_id = my_rider_id THEN RETURN false; END IF;

  UPDATE riders SET is_active = true, is_online = true, updated_at = now() WHERE id = my_rider_id;

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

  INSERT INTO delivery_holder_events (delivery_id, rider_id, event_type, from_rider_id)
  VALUES (_delivery_id, my_rider_id,
          CASE WHEN prev_rider_id IS NULL THEN 'claimed' ELSE 'reassigned_from' END,
          prev_rider_id);

  RETURN true;
END;
$$;
