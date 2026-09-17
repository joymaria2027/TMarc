
ALTER TABLE public.deliveries
ADD COLUMN payment_method text DEFAULT NULL,
ADD COLUMN payment_bank_name text DEFAULT NULL;
