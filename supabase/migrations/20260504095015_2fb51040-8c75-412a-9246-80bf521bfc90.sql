CREATE TABLE public.custom_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view custom resources"
ON public.custom_resources FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage custom resources"
ON public.custom_resources FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "App developers can manage custom resources"
ON public.custom_resources FOR ALL
USING (has_role(auth.uid(), 'app_developer'::app_role));