
-- Revenue sharing table
CREATE TABLE public.revenue_sharing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES public.riders(id),
  restaurant_id UUID REFERENCES public.restaurants(id),
  rider_percentage NUMERIC NOT NULL DEFAULT 0,
  restaurant_percentage NUMERIC NOT NULL DEFAULT 0,
  platform_percentage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_sharing ENABLE ROW LEVEL SECURITY;

-- Riders see only their own sharing
CREATE POLICY "Riders see own sharing" ON public.revenue_sharing
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.riders WHERE riders.id = revenue_sharing.rider_id AND riders.user_id = auth.uid())
  );

-- Admins see all
CREATE POLICY "Admins see all sharing" ON public.revenue_sharing
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Restaurant managers see all
CREATE POLICY "Restaurant managers see all sharing" ON public.revenue_sharing
  FOR SELECT USING (public.has_role(auth.uid(), 'restaurant_manager'));

-- Admins can insert/update sharing
CREATE POLICY "Admins can insert sharing" ON public.revenue_sharing
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sharing" ON public.revenue_sharing
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Role permissions table
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL,
  resource TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_add BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role, resource)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage permissions" ON public.role_permissions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Rider expenses table
CREATE TABLE public.rider_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rider expenses" ON public.rider_expenses
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Accountants can manage rider expenses" ON public.rider_expenses
  FOR ALL USING (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "App developers can manage rider expenses" ON public.rider_expenses
  FOR ALL USING (public.has_role(auth.uid(), 'app_developer'));

CREATE POLICY "Riders can view own expenses" ON public.rider_expenses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.riders WHERE riders.id = rider_expenses.rider_id AND riders.user_id = auth.uid())
  );

-- Enable realtime on deliveries
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;

-- Storage policies for receipts bucket
CREATE POLICY "Auth users can upload receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Auth users can view receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

-- Seed default role permissions
INSERT INTO public.role_permissions (role, resource, can_view, can_edit, can_delete, can_add) VALUES
  ('admin', 'deliveries', true, true, true, true),
  ('admin', 'riders', true, true, true, true),
  ('admin', 'restaurants', true, true, true, true),
  ('admin', 'settlements', true, true, true, true),
  ('admin', 'analytics', true, true, true, true),
  ('rider', 'deliveries', true, true, false, true),
  ('rider', 'riders', true, false, false, false),
  ('accountant', 'deliveries', true, true, false, false),
  ('accountant', 'settlements', true, true, false, false),
  ('accountant', 'analytics', true, false, false, false),
  ('restaurant_manager', 'deliveries', true, false, false, false),
  ('restaurant_manager', 'restaurants', true, true, false, false),
  ('restaurant_manager', 'analytics', true, false, false, false),
  ('business_owner', 'deliveries', true, false, false, false),
  ('business_owner', 'analytics', true, false, false, false),
  ('app_developer', 'deliveries', true, false, false, false),
  ('app_developer', 'analytics', true, false, false, false);
