
-- Update trigger to assign user_id for platform and ucs_rides wallets
CREATE OR REPLACE FUNCTION public.credit_wallets_on_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rev RECORD;
  rider_user UUID;
  rest_manager UUID;
  tariff_total NUMERIC;
  w_id UUID;
  order_ref TEXT;
  bo_user_id UUID;
  ad_user_id UUID;
BEGIN
  IF NEW.settlement_approved = true AND (OLD.settlement_approved IS DISTINCT FROM true) THEN
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
    order_ref := COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8));

    -- Credit rider wallet
    IF rev.rider_id IS NOT NULL AND rev.rider_percentage > 0 THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = rev.rider_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', rev.rider_id, rider_user, (tariff_total * rev.rider_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', tariff_total * rev.rider_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.rider_percentage || '%)', NEW.id);
    END IF;

    -- Credit restaurant wallet
    IF rev.restaurant_id IS NOT NULL AND rev.restaurant_percentage > 0 THEN
      SELECT manager_user_id INTO rest_manager FROM restaurants WHERE id = rev.restaurant_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('restaurant', rev.restaurant_id, rest_manager, (tariff_total * rev.restaurant_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', tariff_total * rev.restaurant_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.restaurant_percentage || '%)', NEW.id);
    END IF;

    -- Credit platform (business owner) wallet - find user with business_owner role
    IF rev.platform_percentage > 0 THEN
      SELECT ur.user_id INTO bo_user_id FROM user_roles ur WHERE ur.role = 'business_owner' LIMIT 1;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('platform', NULL, bo_user_id, (tariff_total * rev.platform_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, user_id = COALESCE(wallets.user_id, EXCLUDED.user_id), updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', tariff_total * rev.platform_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.platform_percentage || '%)', NEW.id);
    END IF;

    -- Credit UCS Rides (app developer) wallet - find user with app_developer role
    IF rev.ucs_rides_percentage > 0 THEN
      SELECT ur.user_id INTO ad_user_id FROM user_roles ur WHERE ur.role = 'app_developer' LIMIT 1;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('ucs_rides', NULL, ad_user_id, (tariff_total * rev.ucs_rides_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, user_id = COALESCE(wallets.user_id, EXCLUDED.user_id), updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', tariff_total * rev.ucs_rides_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.ucs_rides_percentage || '%)', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill existing platform wallet with business_owner user_id
UPDATE wallets SET user_id = (SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'business_owner' LIMIT 1)
WHERE party_type = 'platform' AND user_id IS NULL
AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role = 'business_owner');

-- Backfill existing ucs_rides wallet with app_developer user_id
UPDATE wallets SET user_id = (SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'app_developer' LIMIT 1)
WHERE party_type = 'ucs_rides' AND user_id IS NULL
AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role = 'app_developer');

-- Allow restaurant managers to view their restaurant wallets
CREATE POLICY "Restaurant managers can view own restaurant wallet"
ON public.wallets FOR SELECT
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role)
  AND party_type = 'restaurant'
  AND party_id IN (SELECT id FROM restaurants WHERE manager_user_id = auth.uid())
);

-- Allow restaurant managers to request withdrawals
CREATE POLICY "Restaurant managers can insert withdrawal requests"
ON public.withdrawal_requests FOR INSERT
WITH CHECK (auth.uid() = requested_by);
