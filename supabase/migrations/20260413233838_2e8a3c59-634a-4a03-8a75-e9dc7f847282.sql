
-- Add maker-checker columns to rider_expenses
ALTER TABLE public.rider_expenses
  ADD COLUMN status text NOT NULL DEFAULT 'pending',
  ADD COLUMN verified_by uuid,
  ADD COLUMN verified_at timestamp with time zone,
  ADD COLUMN restaurant_id uuid;

-- Create expense_alerts table
CREATE TABLE public.expense_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rider_id uuid NOT NULL,
  expense_id uuid NOT NULL REFERENCES public.rider_expenses(id) ON DELETE CASCADE,
  restaurant_id uuid,
  alert_type text NOT NULL, -- 'new_expense', 'expense_verified', 'expense_rejected'
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  target_role text NOT NULL, -- 'restaurant_manager' or 'rider'
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_alerts ENABLE ROW LEVEL SECURITY;

-- Riders see alerts targeting them
CREATE POLICY "Riders see own expense alerts"
ON public.expense_alerts FOR SELECT
USING (
  target_role = 'rider' AND EXISTS (
    SELECT 1 FROM riders WHERE riders.id = expense_alerts.rider_id AND riders.user_id = auth.uid()
  )
);

-- Restaurant managers see alerts for their restaurant
CREATE POLICY "Managers see restaurant expense alerts"
ON public.expense_alerts FOR SELECT
USING (
  target_role = 'restaurant_manager' AND EXISTS (
    SELECT 1 FROM restaurants WHERE restaurants.id = expense_alerts.restaurant_id AND restaurants.manager_user_id = auth.uid()
  )
);

-- Admins see all
CREATE POLICY "Admins see all expense alerts"
ON public.expense_alerts FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Accountants see all
CREATE POLICY "Accountants see all expense alerts"
ON public.expense_alerts FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role));

-- Authenticated can insert alerts (system creates them)
CREATE POLICY "Authenticated can insert expense alerts"
ON public.expense_alerts FOR INSERT TO authenticated
WITH CHECK (true);

-- Authenticated can mark as read
CREATE POLICY "Authenticated can update expense alerts"
ON public.expense_alerts FOR UPDATE TO authenticated
USING (true);

-- Update rider_expenses RLS: restaurant managers can view expenses for their restaurant
CREATE POLICY "Restaurant managers can view restaurant expenses"
ON public.rider_expenses FOR SELECT
USING (EXISTS (
  SELECT 1 FROM restaurants
  WHERE restaurants.id = rider_expenses.restaurant_id
  AND restaurants.manager_user_id = auth.uid()
));

-- Restaurant managers can update status (verify/reject)
CREATE POLICY "Restaurant managers can verify expenses"
ON public.rider_expenses FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM restaurants
  WHERE restaurants.id = rider_expenses.restaurant_id
  AND restaurants.manager_user_id = auth.uid()
));
