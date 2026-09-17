
-- Add UCS Rides percentage to revenue sharing
ALTER TABLE public.revenue_sharing ADD COLUMN ucs_rides_percentage NUMERIC NOT NULL DEFAULT 0;

-- Custom roles table for dynamic role management
CREATE TABLE public.custom_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view custom roles" ON public.custom_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage custom roles" ON public.custom_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "App developers can manage custom roles" ON public.custom_roles FOR ALL USING (has_role(auth.uid(), 'app_developer'::app_role));
