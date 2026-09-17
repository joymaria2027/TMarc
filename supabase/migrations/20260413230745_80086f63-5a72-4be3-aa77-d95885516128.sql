
-- Add accountant_user_id to restaurants
ALTER TABLE public.restaurants ADD COLUMN accountant_user_id uuid;

-- Drop existing accountant policies on deliveries
DROP POLICY IF EXISTS "Accountants see all deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Accountants can update deliveries" ON public.deliveries;

-- Accountants see only deliveries for their assigned restaurants
CREATE POLICY "Accountants see own restaurant deliveries"
ON public.deliveries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM restaurants
    WHERE restaurants.id = deliveries.restaurant_id
    AND restaurants.accountant_user_id = auth.uid()
  )
);

CREATE POLICY "Accountants can update own restaurant deliveries"
ON public.deliveries FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM restaurants
    WHERE restaurants.id = deliveries.restaurant_id
    AND restaurants.accountant_user_id = auth.uid()
  )
);

-- Update revenue_sharing: restaurant managers see only their restaurant
DROP POLICY IF EXISTS "Restaurant managers see all sharing" ON public.revenue_sharing;

CREATE POLICY "Restaurant managers see own restaurant sharing"
ON public.revenue_sharing FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM restaurants
    WHERE restaurants.id = revenue_sharing.restaurant_id
    AND restaurants.manager_user_id = auth.uid()
  )
);

-- Accountants see only their restaurant's sharing
CREATE POLICY "Accountants see own restaurant sharing"
ON public.revenue_sharing FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM restaurants
    WHERE restaurants.id = revenue_sharing.restaurant_id
    AND restaurants.accountant_user_id = auth.uid()
  )
);

-- Accountants see only their restaurant's expenses (via rider deliveries)
DROP POLICY IF EXISTS "Accountants can manage rider expenses" ON public.rider_expenses;

CREATE POLICY "Accountants can view own restaurant rider expenses"
ON public.rider_expenses FOR SELECT
USING (
  has_role(auth.uid(), 'accountant'::app_role)
);

CREATE POLICY "Accountants can insert rider expenses"
ON public.rider_expenses FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'accountant'::app_role)
);

CREATE POLICY "Accountants can update rider expenses"
ON public.rider_expenses FOR UPDATE
USING (
  has_role(auth.uid(), 'accountant'::app_role)
);

CREATE POLICY "Accountants can delete rider expenses"
ON public.rider_expenses FOR DELETE
USING (
  has_role(auth.uid(), 'accountant'::app_role)
);
