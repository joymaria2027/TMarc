
-- Add column to track which delivery settlement consumed each expense
ALTER TABLE public.rider_expenses ADD COLUMN IF NOT EXISTS deducted_in_delivery_id UUID DEFAULT NULL;

-- Update the settlement trigger to deduct expenses before revenue sharing
CREATE OR REPLACE FUNCTION public.credit_wallets_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rev RECORD;
  rider_user UUID;
  rest_manager UUID;
  tariff_total NUMERIC;
  total_expenses NUMERIC;
  net_income NUMERIC;
  w_id UUID;
  order_ref TEXT;
  bo_user_id UUID;
  ad_user_id UUID;
  effective_rider_id UUID;
BEGIN
  IF NEW.settlement_approved = true AND (OLD.settlement_approved IS DISTINCT FROM true) THEN
    -- Try to find revenue sharing by delivery_id first, then by restaurant_id
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN
      SELECT * INTO rev FROM revenue_sharing WHERE restaurant_id = NEW.restaurant_id LIMIT 1;
    END IF;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
    order_ref := COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8));

    -- Use rider_id from revenue_sharing, fall back to delivery's rider_id
    effective_rider_id := COALESCE(rev.rider_id, NEW.rider_id);

    -- Calculate approved but not-yet-deducted expenses for this rider at this restaurant
    total_expenses := 0;
    IF effective_rider_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO total_expenses
      FROM rider_expenses
      WHERE rider_id = effective_rider_id
        AND restaurant_id = NEW.restaurant_id
        AND status = 'approved'
        AND deducted_in_delivery_id IS NULL;

      -- Mark those expenses as deducted
      IF total_expenses > 0 THEN
        UPDATE rider_expenses
        SET deducted_in_delivery_id = NEW.id
        WHERE rider_id = effective_rider_id
          AND restaurant_id = NEW.restaurant_id
          AND status = 'approved'
          AND deducted_in_delivery_id IS NULL;
      END IF;
    END IF;

    -- Net income = tariff minus expenses (floor at 0)
    net_income := GREATEST(tariff_total - total_expenses, 0);

    -- Credit rider wallet
    IF effective_rider_id IS NOT NULL AND rev.rider_percentage > 0 THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = effective_rider_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', effective_rider_id, rider_user, (net_income * rev.rider_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.rider_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.rider_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    -- Credit restaurant wallet
    IF NEW.restaurant_id IS NOT NULL AND rev.restaurant_percentage > 0 THEN
      SELECT manager_user_id INTO rest_manager FROM restaurants WHERE id = NEW.restaurant_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('restaurant', NEW.restaurant_id, rest_manager, (net_income * rev.restaurant_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.restaurant_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.restaurant_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    -- Credit UCS Rides wallet → goes to BUSINESS OWNER
    IF rev.ucs_rides_percentage > 0 THEN
      SELECT ur.user_id INTO bo_user_id FROM user_roles ur WHERE ur.role = 'business_owner' LIMIT 1;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('ucs_rides', NULL, bo_user_id, (net_income * rev.ucs_rides_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, user_id = COALESCE(wallets.user_id, EXCLUDED.user_id), updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.ucs_rides_percentage / 100,
        'UCS Rides revenue from delivery ' || order_ref || ' (' || rev.ucs_rides_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    -- Credit Platform wallet → goes to APP DEVELOPER
    IF rev.platform_percentage > 0 THEN
      SELECT ur.user_id INTO ad_user_id FROM user_roles ur WHERE ur.role = 'app_developer' LIMIT 1;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('platform', NULL, ad_user_id, (net_income * rev.platform_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, user_id = COALESCE(wallets.user_id, EXCLUDED.user_id), updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.platform_percentage / 100,
        'Platform revenue from delivery ' || order_ref || ' (' || rev.platform_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
