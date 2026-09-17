
-- Riders SELECT for dispatching roles
CREATE POLICY "Restaurant managers can view active riders"
ON public.riders FOR SELECT
USING (has_role(auth.uid(), 'restaurant_manager'::app_role) AND is_active = true);

CREATE POLICY "Business owners can view riders"
ON public.riders FOR SELECT
USING (has_role(auth.uid(), 'business_owner'::app_role));

CREATE POLICY "App developers can view riders"
ON public.riders FOR SELECT
USING (has_role(auth.uid(), 'app_developer'::app_role));

CREATE POLICY "Accountants can view riders"
ON public.riders FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Unassigned delivery pool: any active rider can see and claim
CREATE POLICY "Active riders can view unassigned deliveries"
ON public.deliveries FOR SELECT
USING (
  status = 'unassigned'
  AND rider_id IS NULL
  AND EXISTS (SELECT 1 FROM public.riders r WHERE r.user_id = auth.uid() AND r.is_active = true)
);

CREATE POLICY "Active riders can claim unassigned deliveries"
ON public.deliveries FOR UPDATE
USING (
  status = 'unassigned'
  AND rider_id IS NULL
  AND EXISTS (SELECT 1 FROM public.riders r WHERE r.user_id = auth.uid() AND r.is_active = true)
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.riders r WHERE r.id = deliveries.rider_id AND r.user_id = auth.uid())
);

-- Business owners and app developers also need to see all deliveries (admin already can)
CREATE POLICY "App developers see all deliveries"
ON public.deliveries FOR SELECT
USING (has_role(auth.uid(), 'app_developer'::app_role));
