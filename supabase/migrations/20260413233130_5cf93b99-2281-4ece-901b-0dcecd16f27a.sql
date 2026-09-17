
CREATE TABLE public.restaurant_riders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, rider_id)
);

ALTER TABLE public.restaurant_riders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage restaurant riders"
ON public.restaurant_riders FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view restaurant riders"
ON public.restaurant_riders FOR SELECT TO authenticated
USING (true);
