
CREATE TABLE public.delivery_rejections (
  delivery_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (delivery_id, rider_id)
);

CREATE INDEX idx_delivery_rejections_rider ON public.delivery_rejections(rider_id);
CREATE INDEX idx_delivery_rejections_delivery ON public.delivery_rejections(delivery_id);

ALTER TABLE public.delivery_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Riders can insert own rejections"
ON public.delivery_rejections FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM riders r WHERE r.id = rider_id AND r.user_id = auth.uid()));

CREATE POLICY "Riders can view own rejections"
ON public.delivery_rejections FOR SELECT
USING (EXISTS (SELECT 1 FROM riders r WHERE r.id = rider_id AND r.user_id = auth.uid()));

CREATE POLICY "Admins view all rejections"
ON public.delivery_rejections FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers view rejections for own restaurant deliveries"
ON public.delivery_rejections FOR SELECT
USING (EXISTS (
  SELECT 1 FROM deliveries d JOIN restaurants r ON r.id = d.restaurant_id
  WHERE d.id = delivery_rejections.delivery_id AND r.manager_user_id = auth.uid()
));

CREATE POLICY "Accountants view rejections for own restaurant deliveries"
ON public.delivery_rejections FOR SELECT
USING (EXISTS (
  SELECT 1 FROM deliveries d JOIN restaurants r ON r.id = d.restaurant_id
  WHERE d.id = delivery_rejections.delivery_id AND r.accountant_user_id = auth.uid()
));

CREATE OR REPLACE FUNCTION public.reject_delivery(_delivery_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_rider_id uuid;
BEGIN
  SELECT id INTO my_rider_id FROM riders WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not an active rider';
  END IF;

  INSERT INTO delivery_rejections (delivery_id, rider_id)
  VALUES (_delivery_id, my_rider_id)
  ON CONFLICT DO NOTHING;

  -- Release the delivery back to the open pool so other riders can see/accept it
  UPDATE deliveries
  SET rider_id = NULL,
      status = 'unassigned',
      dispatched_at = NULL
  WHERE id = _delivery_id
    AND (rider_id = my_rider_id OR rider_id IS NULL);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_offered_deliveries()
RETURNS SETOF public.deliveries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM deliveries d
  WHERE d.status = 'unassigned'
    AND d.rider_id IS NULL
    AND EXISTS (SELECT 1 FROM riders r WHERE r.user_id = auth.uid() AND r.is_active = true)
    AND NOT EXISTS (
      SELECT 1 FROM delivery_rejections dr
      JOIN riders r ON r.id = dr.rider_id
      WHERE dr.delivery_id = d.id AND r.user_id = auth.uid()
    )
  ORDER BY d.created_at DESC;
$$;
