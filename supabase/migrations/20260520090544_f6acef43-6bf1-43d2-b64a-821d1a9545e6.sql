
CREATE TABLE public.business_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view business types"
ON public.business_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert business types"
ON public.business_types FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update business types"
ON public.business_types FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete business types"
ON public.business_types FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_business_types_updated_at
BEFORE UPDATE ON public.business_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.companies
  ADD COLUMN business_type_id uuid REFERENCES public.business_types(id) ON DELETE SET NULL;

CREATE INDEX idx_companies_business_type_id ON public.companies(business_type_id);

INSERT INTO public.business_types (name, description) VALUES
  ('Restaurant', 'Food & beverage establishments'),
  ('Pharmacy', 'Pharmacies and drug stores'),
  ('Supermarket', 'Grocery and supermarkets'),
  ('Boutique', 'Clothing and retail boutiques'),
  ('Other', 'Other business types')
ON CONFLICT (name) DO NOTHING;
