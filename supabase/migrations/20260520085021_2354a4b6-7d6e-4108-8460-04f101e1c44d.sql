
-- 1. Rename enum value (auto-updates all policies referencing it)
ALTER TYPE public.app_role RENAME VALUE 'restaurant_manager' TO 'company_manager';

-- 2. Rename tables
ALTER TABLE public.restaurants RENAME TO companies;
ALTER TABLE public.restaurant_riders RENAME TO company_riders;
ALTER TABLE public.restaurant_tariffs RENAME TO company_tariffs;

-- 3. Rename columns
ALTER TABLE public.deliveries RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.wallets RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.revenue_sharing RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.revenue_sharing RENAME COLUMN restaurant_percentage TO company_percentage;
ALTER TABLE public.rider_expenses RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.expense_alerts RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.tariff_notifications RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.company_riders RENAME COLUMN restaurant_id TO company_id;
ALTER TABLE public.company_tariffs RENAME COLUMN restaurant_id TO company_id;

-- Rename related FK ref columns on companies table itself: none, manager_user_id/accountant_user_id stay.

-- 4. Migrate wallet party_type data
UPDATE public.wallets SET party_type = 'company' WHERE party_type = 'restaurant';

-- 5. Rename old triggers (cosmetic, but keeps things tidy)
ALTER TRIGGER update_restaurants_updated_at ON public.companies RENAME TO update_companies_updated_at;
ALTER TRIGGER update_restaurant_tariffs_updated_at ON public.company_tariffs RENAME TO update_company_tariffs_updated_at;

-- 6. Drop triggers that we will recreate to point at renamed functions
DROP TRIGGER IF EXISTS trg_create_wallet_on_restaurant_manager ON public.companies;
DROP TRIGGER IF EXISTS trg_create_rider_wallet_on_assign ON public.company_riders;
DROP TRIGGER IF EXISTS on_tariff_change ON public.company_tariffs;

-- 7. Recreate functions with new identifiers

CREATE OR REPLACE FUNCTION public.credit_wallets_on_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rev RECORD;
  rider_user UUID;
  comp_manager UUID;
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
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN
      SELECT * INTO rev FROM revenue_sharing
      WHERE company_id = NEW.company_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
    order_ref := COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8));
    effective_rider_id := NEW.rider_id;

    total_expenses := 0;
    IF effective_rider_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO total_expenses
      FROM rider_expenses
      WHERE rider_id = effective_rider_id
        AND company_id = NEW.company_id
        AND status IN ('approved', 'verified')
        AND deducted_in_delivery_id IS NULL;

      IF total_expenses > 0 THEN
        UPDATE rider_expenses
        SET deducted_in_delivery_id = NEW.id
        WHERE rider_id = effective_rider_id
          AND company_id = NEW.company_id
          AND status IN ('approved', 'verified')
          AND deducted_in_delivery_id IS NULL;
      END IF;
    END IF;

    net_income := GREATEST(tariff_total - total_expenses, 0);

    IF effective_rider_id IS NOT NULL AND rev.rider_percentage > 0 THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = effective_rider_id;
      SELECT id INTO w_id FROM wallets
      WHERE party_type = 'rider' AND party_id = effective_rider_id AND company_id = NEW.company_id;

      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, company_id, balance)
        VALUES ('rider', effective_rider_id, rider_user, NEW.company_id, (net_income * rev.rider_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.rider_percentage / 100), updated_at = now()
        WHERE id = w_id;
      END IF;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.rider_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.rider_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    IF NEW.company_id IS NOT NULL AND rev.company_percentage > 0 THEN
      SELECT manager_user_id INTO comp_manager FROM companies WHERE id = NEW.company_id;
      SELECT id INTO w_id FROM wallets
      WHERE party_type = 'company' AND party_id = NEW.company_id;

      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, company_id, balance)
        VALUES ('company', NEW.company_id, comp_manager, NEW.company_id, (net_income * rev.company_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.company_percentage / 100), updated_at = now()
        WHERE id = w_id;
      END IF;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.company_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.company_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    IF rev.ucs_rides_percentage > 0 THEN
      SELECT ur.user_id INTO bo_user_id FROM user_roles ur WHERE ur.role = 'business_owner' LIMIT 1;
      SELECT id INTO w_id FROM wallets WHERE party_type = 'ucs_rides';
      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, balance)
        VALUES ('ucs_rides', NULL, bo_user_id, (net_income * rev.ucs_rides_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.ucs_rides_percentage / 100),
          user_id = COALESCE(user_id, bo_user_id), updated_at = now()
        WHERE id = w_id;
      END IF;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.ucs_rides_percentage / 100,
        'UCS Rides revenue from delivery ' || order_ref || ' (' || rev.ucs_rides_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    IF rev.platform_percentage > 0 THEN
      SELECT ur.user_id INTO ad_user_id FROM user_roles ur WHERE ur.role = 'app_developer' LIMIT 1;
      SELECT id INTO w_id FROM wallets WHERE party_type = 'platform';
      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, balance)
        VALUES ('platform', NULL, ad_user_id, (net_income * rev.platform_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.platform_percentage / 100),
          user_id = COALESCE(user_id, ad_user_id), updated_at = now()
        WHERE id = w_id;
      END IF;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.platform_percentage / 100,
        'Platform revenue from delivery ' || order_ref || ' (' || rev.platform_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_wallet_on_company_manager()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.manager_user_id IS NOT NULL AND (OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id) THEN
    IF EXISTS (
      SELECT 1 FROM wallets
      WHERE party_type = 'company'
        AND party_id IS NOT DISTINCT FROM NEW.id
    ) THEN
      UPDATE wallets SET user_id = NEW.manager_user_id, updated_at = now()
      WHERE party_type = 'company' AND party_id = NEW.id;
    ELSE
      INSERT INTO wallets (party_type, party_id, user_id, company_id, balance)
      VALUES ('company', NEW.id, NEW.manager_user_id, NEW.id, 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_wallet_on_restaurant_manager() CASCADE;

CREATE OR REPLACE FUNCTION public.create_rider_wallet_on_company_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_user_id uuid;
BEGIN
  SELECT user_id INTO r_user_id FROM riders WHERE id = NEW.rider_id;
  IF NOT EXISTS (
    SELECT 1 FROM wallets
    WHERE party_type = 'rider'
      AND party_id = NEW.rider_id
      AND company_id IS NOT DISTINCT FROM NEW.company_id
  ) THEN
    INSERT INTO wallets (party_type, party_id, user_id, company_id, balance)
    VALUES ('rider', NEW.rider_id, r_user_id, NEW.company_id, 0);
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.create_rider_wallet_on_restaurant_assign() CASCADE;

CREATE OR REPLACE FUNCTION public.create_wallet_on_rider_create()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM wallets
    WHERE party_type = 'rider'
      AND party_id IS NOT DISTINCT FROM NEW.id
      AND company_id IS NULL
  ) THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('rider', NEW.id, NEW.user_id, 0);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_wallet_on_role_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_id UUID;
  comp_id UUID;
BEGIN
  IF NEW.role = 'rider' THEN
    SELECT id INTO r_id FROM riders WHERE user_id = NEW.user_id LIMIT 1;
    IF r_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM wallets WHERE party_type = 'rider' AND party_id = r_id AND company_id IS NULL
    ) THEN
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', r_id, NEW.user_id, 0);
    END IF;
  END IF;

  IF NEW.role = 'company_manager' THEN
    FOR comp_id IN SELECT id FROM companies WHERE manager_user_id = NEW.user_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM wallets WHERE party_type = 'company' AND party_id = comp_id
      ) THEN
        INSERT INTO wallets (party_type, party_id, user_id, company_id, balance)
        VALUES ('company', comp_id, NEW.user_id, comp_id, 0);
      END IF;
    END LOOP;
  END IF;

  IF NEW.role = 'business_owner' THEN
    IF NOT EXISTS (SELECT 1 FROM wallets WHERE party_type = 'ucs_rides') THEN
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('ucs_rides', NULL, NEW.user_id, 0);
    END IF;
  END IF;

  IF NEW.role = 'app_developer' THEN
    IF NOT EXISTS (SELECT 1 FROM wallets WHERE party_type = 'platform') THEN
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('platform', NULL, NEW.user_id, 0);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_withdrawal_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  party_name TEXT;
BEGIN
  SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;

  IF w.party_type = 'rider' THEN
    SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
  ELSIF w.party_type = 'company' THEN
    SELECT name INTO party_name FROM companies WHERE id = w.party_id;
  ELSE
    party_name := 'Platform';
  END IF;

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL, 'withdrawal_request',
    COALESCE(party_name, 'Unknown') || ' requested a withdrawal of D ' || NEW.amount || '. Please review and process.');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_delivery_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rider_name TEXT;
  comp_name TEXT;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    SELECT p.full_name INTO rider_name
    FROM riders r JOIN profiles p ON p.user_id = r.user_id
    WHERE r.id = NEW.rider_id;

    SELECT name INTO comp_name FROM companies WHERE id = NEW.company_id;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (
      NEW.id,
      'delivery_completed',
      COALESCE(rider_name, 'A rider') || ' completed delivery ' || COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8)) || ' from ' || COALESCE(comp_name, 'unknown company')
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_withdrawal_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  party_name TEXT;
BEGIN
  IF NEW.status = 'manager_approved' AND OLD.status IS DISTINCT FROM 'manager_approved' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'company' THEN
      SELECT name INTO party_name FROM companies WHERE id = w.party_id;
    ELSE
      party_name := 'Platform';
    END IF;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_request',
      'Withdrawal of D ' || NEW.amount || ' for ' || COALESCE(party_name, 'unknown') ||
      ' approved by company manager. Awaiting accountant final approval.');
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE wallets SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;

    INSERT INTO wallet_transactions (wallet_id, type, amount, description, withdrawal_request_id)
    VALUES (NEW.wallet_id, 'debit', NEW.amount,
      'Withdrawal via ' || COALESCE(NEW.payout_method, 'N/A'), NEW.id);

    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;

    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'company' THEN
      SELECT name INTO party_name FROM companies WHERE id = w.party_id;
    ELSE
      party_name := 'Platform';
    END IF;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_completed',
      'Your withdrawal of D ' || NEW.amount || ' has been processed via ' || COALESCE(NEW.payout_method, 'N/A'));

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_completed',
      'Withdrawal of D ' || NEW.amount || ' completed for ' || COALESCE(party_name, 'unknown') ||
      ' via ' || COALESCE(NEW.payout_method, 'N/A'));
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'company' THEN
      SELECT name INTO party_name FROM companies WHERE id = w.party_id;
    ELSE
      party_name := 'Platform';
    END IF;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_rejected',
      'Withdrawal of D ' || NEW.amount || ' was rejected for ' || COALESCE(party_name, 'unknown'));
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_tariff_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  comp_name TEXT;
  msg TEXT;
  old_amt NUMERIC;
BEGIN
  SELECT name INTO comp_name FROM companies WHERE id = NEW.company_id;

  IF TG_OP = 'INSERT' THEN
    msg := comp_name || ' set delivery tariff for ' || NEW.location_name || ' to ' || NEW.tariff_amount;
    old_amt := NULL;
  ELSIF TG_OP = 'UPDATE' AND OLD.tariff_amount IS DISTINCT FROM NEW.tariff_amount THEN
    msg := comp_name || ' updated tariff for ' || NEW.location_name || ' from ' || OLD.tariff_amount || ' to ' || NEW.tariff_amount;
    old_amt := OLD.tariff_amount;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO tariff_notifications (company_id, tariff_id, message, location_name, old_amount, new_amount)
  VALUES (NEW.company_id, NEW.id, msg, NEW.location_name, old_amt, NEW.tariff_amount);

  RETURN NEW;
END;
$function$;

-- 8. Recreate triggers on renamed tables pointing to renamed functions
CREATE TRIGGER trg_create_wallet_on_company_manager
AFTER INSERT OR UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.create_wallet_on_company_manager();

CREATE TRIGGER trg_create_rider_wallet_on_assign
AFTER INSERT ON public.company_riders
FOR EACH ROW EXECUTE FUNCTION public.create_rider_wallet_on_company_assign();

CREATE TRIGGER on_tariff_change
AFTER INSERT OR UPDATE ON public.company_tariffs
FOR EACH ROW EXECUTE FUNCTION public.notify_tariff_change();
