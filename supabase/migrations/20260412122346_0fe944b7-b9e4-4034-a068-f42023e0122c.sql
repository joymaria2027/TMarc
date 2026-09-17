
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'rider', 'accountant', 'restaurant_manager', 'business_owner', 'app_developer');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Restaurants table
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  manager_user_id UUID REFERENCES auth.users(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- Riders table
CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL DEFAULT 'motorcycle',
  license_plate TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_online BOOLEAN NOT NULL DEFAULT false,
  current_latitude DOUBLE PRECISION,
  current_longitude DOUBLE PRECISION,
  last_location_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

-- Deliveries table
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES public.riders(id),
  restaurant_id UUID REFERENCES public.restaurants(id) NOT NULL,
  order_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatched','picked_up','in_transit','delivered','cancelled')),
  pickup_address TEXT NOT NULL,
  pickup_latitude DOUBLE PRECISION,
  pickup_longitude DOUBLE PRECISION,
  dropoff_address TEXT NOT NULL,
  dropoff_latitude DOUBLE PRECISION,
  dropoff_longitude DOUBLE PRECISION,
  estimated_distance_km DOUBLE PRECISION,
  actual_distance_km DOUBLE PRECISION,
  estimated_tariff NUMERIC(10,2),
  actual_tariff NUMERIC(10,2),
  tariff_override_by UUID REFERENCES auth.users(id),
  tariff_override_reason TEXT,
  dispatched_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  route_deviation_detected BOOLEAN NOT NULL DEFAULT false,
  gps_confirmed BOOLEAN NOT NULL DEFAULT false,
  receipt_attached BOOLEAN NOT NULL DEFAULT false,
  settlement_approved BOOLEAN NOT NULL DEFAULT false,
  settlement_approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Delivery waypoints (GPS tracking points)
CREATE TABLE public.delivery_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_waypoints ENABLE ROW LEVEL SECURITY;

-- Delivery receipts
CREATE TABLE public.delivery_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE NOT NULL,
  receipt_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_receipts ENABLE ROW LEVEL SECURITY;

-- Delivery alerts
CREATE TABLE public.delivery_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('late_delivery','route_deviation','suspicious','duplicate','out_of_area')),
  message TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_alerts ENABLE ROW LEVEL SECURITY;

-- Service area config
CREATE TABLE public.service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  center_latitude DOUBLE PRECISION NOT NULL,
  center_longitude DOUBLE PRECISION NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_riders_updated_at BEFORE UPDATE ON public.riders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "System inserts profiles" ON public.profiles FOR INSERT WITH CHECK (true);

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Restaurants
CREATE POLICY "Authenticated users can view restaurants" ON public.restaurants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert restaurants" ON public.restaurants FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update restaurants" ON public.restaurants FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete restaurants" ON public.restaurants FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Riders
CREATE POLICY "Riders can view own record" ON public.riders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Riders can update own record" ON public.riders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all riders" ON public.riders FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert riders" ON public.riders FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update riders" ON public.riders FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete riders" ON public.riders FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Deliveries
CREATE POLICY "Riders see own deliveries" ON public.deliveries FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.riders WHERE riders.id = deliveries.rider_id AND riders.user_id = auth.uid())
);
CREATE POLICY "Admins see all deliveries" ON public.deliveries FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants see all deliveries" ON public.deliveries FOR SELECT USING (public.has_role(auth.uid(), 'accountant'));
CREATE POLICY "Business owners see all deliveries" ON public.deliveries FOR SELECT USING (public.has_role(auth.uid(), 'business_owner'));
CREATE POLICY "Restaurant managers see own deliveries" ON public.deliveries FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.restaurants WHERE restaurants.id = deliveries.restaurant_id AND restaurants.manager_user_id = auth.uid())
);
CREATE POLICY "Admins can insert deliveries" ON public.deliveries FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update deliveries" ON public.deliveries FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Riders can update own deliveries" ON public.deliveries FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.riders WHERE riders.id = deliveries.rider_id AND riders.user_id = auth.uid())
);
CREATE POLICY "Riders can insert deliveries" ON public.deliveries FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.riders WHERE riders.id = deliveries.rider_id AND riders.user_id = auth.uid())
);
CREATE POLICY "Accountants can update deliveries" ON public.deliveries FOR UPDATE USING (public.has_role(auth.uid(), 'accountant'));

-- Waypoints
CREATE POLICY "Riders can insert own waypoints" ON public.delivery_waypoints FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.deliveries d JOIN public.riders r ON r.id = d.rider_id WHERE d.id = delivery_waypoints.delivery_id AND r.user_id = auth.uid())
);
CREATE POLICY "Admins can view all waypoints" ON public.delivery_waypoints FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants can view all waypoints" ON public.delivery_waypoints FOR SELECT USING (public.has_role(auth.uid(), 'accountant'));
CREATE POLICY "Riders can view own waypoints" ON public.delivery_waypoints FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.deliveries d JOIN public.riders r ON r.id = d.rider_id WHERE d.id = delivery_waypoints.delivery_id AND r.user_id = auth.uid())
);

-- Receipts
CREATE POLICY "Riders can upload receipts" ON public.delivery_receipts FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Admins can view all receipts" ON public.delivery_receipts FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants can view all receipts" ON public.delivery_receipts FOR SELECT USING (public.has_role(auth.uid(), 'accountant'));
CREATE POLICY "Accountants can update receipts" ON public.delivery_receipts FOR UPDATE USING (public.has_role(auth.uid(), 'accountant'));
CREATE POLICY "Riders can view own receipts" ON public.delivery_receipts FOR SELECT USING (auth.uid() = uploaded_by);

-- Alerts
CREATE POLICY "Admins can view alerts" ON public.delivery_alerts FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert alerts" ON public.delivery_alerts FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update alerts" ON public.delivery_alerts FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants can view alerts" ON public.delivery_alerts FOR SELECT USING (public.has_role(auth.uid(), 'accountant'));

-- Service areas
CREATE POLICY "Authenticated can view service areas" ON public.service_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert service areas" ON public.service_areas FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update service areas" ON public.service_areas FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete service areas" ON public.service_areas FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);
CREATE POLICY "Authenticated users can upload receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Admins can view all receipt files" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Accountants can view all receipt files" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'accountant'));
CREATE POLICY "Users can view own receipt files" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes
CREATE INDEX idx_deliveries_rider ON public.deliveries(rider_id);
CREATE INDEX idx_deliveries_restaurant ON public.deliveries(restaurant_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_waypoints_delivery ON public.delivery_waypoints(delivery_id);
CREATE INDEX idx_waypoints_recorded ON public.delivery_waypoints(recorded_at);
CREATE INDEX idx_riders_user ON public.riders(user_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
