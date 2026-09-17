
-- Drop permissive policies
DROP POLICY "Authenticated can insert expense alerts" ON public.expense_alerts;
DROP POLICY "Authenticated can update expense alerts" ON public.expense_alerts;

-- Tighter insert: admins, accountants, app_developers
CREATE POLICY "Admins can insert expense alerts"
ON public.expense_alerts FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'app_developer'::app_role)
);

-- Update: only target users can mark as read
CREATE POLICY "Target users can update expense alerts"
ON public.expense_alerts FOR UPDATE
USING (
  (target_role = 'rider' AND EXISTS (
    SELECT 1 FROM riders WHERE riders.id = expense_alerts.rider_id AND riders.user_id = auth.uid()
  ))
  OR (target_role = 'restaurant_manager' AND EXISTS (
    SELECT 1 FROM restaurants WHERE restaurants.id = expense_alerts.restaurant_id AND restaurants.manager_user_id = auth.uid()
  ))
  OR has_role(auth.uid(), 'admin'::app_role)
);
