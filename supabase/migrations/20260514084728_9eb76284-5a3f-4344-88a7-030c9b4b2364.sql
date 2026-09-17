ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_phone text NOT NULL DEFAULT '';

ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_customer_name_not_blank CHECK (length(btrim(customer_name)) > 0) NOT VALID;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_customer_phone_not_blank CHECK (length(btrim(customer_phone)) > 0) NOT VALID;

DROP POLICY IF EXISTS "Active riders can view revenue sharing" ON public.revenue_sharing;
DROP POLICY IF EXISTS "Riders see sharing for assigned restaurants" ON public.revenue_sharing;