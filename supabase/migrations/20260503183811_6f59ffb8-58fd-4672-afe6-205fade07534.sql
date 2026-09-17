
-- restaurants: managers can update their own
CREATE POLICY "Restaurant managers can update own restaurant"
ON public.restaurants FOR UPDATE
USING (manager_user_id = auth.uid());

-- withdrawal_requests: drop blanket accountant + manager finalize policies
DROP POLICY IF EXISTS "Accountants can update withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Accountants can view all withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Restaurant managers can finalize withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY "Accountants view own restaurant withdrawals"
ON public.withdrawal_requests FOR SELECT
USING (
  has_role(auth.uid(), 'accountant'::app_role) AND EXISTS (
    SELECT 1 FROM wallets w
    LEFT JOIN restaurants r_party ON w.party_type = 'restaurant' AND r_party.id = w.party_id
    LEFT JOIN restaurants r_rider ON w.party_type = 'rider' AND r_rider.id = w.restaurant_id
    WHERE w.id = withdrawal_requests.wallet_id
      AND (r_party.accountant_user_id = auth.uid() OR r_rider.accountant_user_id = auth.uid())
  )
);

CREATE POLICY "Accountants update own restaurant withdrawals"
ON public.withdrawal_requests FOR UPDATE
USING (
  has_role(auth.uid(), 'accountant'::app_role) AND EXISTS (
    SELECT 1 FROM wallets w
    LEFT JOIN restaurants r_party ON w.party_type = 'restaurant' AND r_party.id = w.party_id
    LEFT JOIN restaurants r_rider ON w.party_type = 'rider' AND r_rider.id = w.restaurant_id
    WHERE w.id = withdrawal_requests.wallet_id
      AND (r_party.accountant_user_id = auth.uid() OR r_rider.accountant_user_id = auth.uid())
  )
);

CREATE POLICY "Managers finalize own restaurant withdrawals"
ON public.withdrawal_requests FOR UPDATE
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
    SELECT 1 FROM wallets w
    LEFT JOIN restaurants r_party ON w.party_type = 'restaurant' AND r_party.id = w.party_id
    LEFT JOIN restaurants r_rider ON w.party_type = 'rider' AND r_rider.id = w.restaurant_id
    WHERE w.id = withdrawal_requests.wallet_id
      AND (r_party.manager_user_id = auth.uid() OR r_rider.manager_user_id = auth.uid())
  )
);

-- delivery_alerts: scope manager + accountant by restaurant
DROP POLICY IF EXISTS "Restaurant managers can view alerts" ON public.delivery_alerts;
DROP POLICY IF EXISTS "Restaurant managers can update alerts" ON public.delivery_alerts;
DROP POLICY IF EXISTS "Accountants can view alerts" ON public.delivery_alerts;

CREATE POLICY "Managers view own restaurant alerts"
ON public.delivery_alerts FOR SELECT
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role) AND (
    delivery_id IS NULL OR EXISTS (
      SELECT 1 FROM deliveries d JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.id = delivery_alerts.delivery_id AND r.manager_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Managers update own restaurant alerts"
ON public.delivery_alerts FOR UPDATE
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role) AND (
    delivery_id IS NULL OR EXISTS (
      SELECT 1 FROM deliveries d JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.id = delivery_alerts.delivery_id AND r.manager_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Accountants view own restaurant alerts"
ON public.delivery_alerts FOR SELECT
USING (
  has_role(auth.uid(), 'accountant'::app_role) AND (
    delivery_id IS NULL OR EXISTS (
      SELECT 1 FROM deliveries d JOIN restaurants r ON r.id = d.restaurant_id
      WHERE d.id = delivery_alerts.delivery_id AND r.accountant_user_id = auth.uid()
    )
  )
);

-- tariff_notifications: scope manager
CREATE POLICY "Managers view own restaurant tariff notifications"
ON public.tariff_notifications FOR SELECT
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = tariff_notifications.restaurant_id AND r.manager_user_id = auth.uid()
  )
);

CREATE POLICY "Managers update own restaurant tariff notifications"
ON public.tariff_notifications FOR UPDATE
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = tariff_notifications.restaurant_id AND r.manager_user_id = auth.uid()
  )
);

-- wallet_transactions: scope accountant by restaurant
DROP POLICY IF EXISTS "Accountants can view all wallet transactions" ON public.wallet_transactions;

CREATE POLICY "Accountants view own restaurant wallet transactions"
ON public.wallet_transactions FOR SELECT
USING (
  has_role(auth.uid(), 'accountant'::app_role) AND EXISTS (
    SELECT 1 FROM wallets w
    LEFT JOIN restaurants r_party ON w.party_type = 'restaurant' AND r_party.id = w.party_id
    LEFT JOIN restaurants r_rider ON w.party_type = 'rider' AND r_rider.id = w.restaurant_id
    WHERE w.id = wallet_transactions.wallet_id
      AND (r_party.accountant_user_id = auth.uid() OR r_rider.accountant_user_id = auth.uid())
  )
);

CREATE POLICY "Managers view own restaurant wallet transactions"
ON public.wallet_transactions FOR SELECT
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role) AND EXISTS (
    SELECT 1 FROM wallets w
    LEFT JOIN restaurants r_party ON w.party_type = 'restaurant' AND r_party.id = w.party_id
    LEFT JOIN restaurants r_rider ON w.party_type = 'rider' AND r_rider.id = w.restaurant_id
    WHERE w.id = wallet_transactions.wallet_id
      AND (r_party.manager_user_id = auth.uid() OR r_rider.manager_user_id = auth.uid())
  )
);
