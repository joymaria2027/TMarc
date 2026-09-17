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
      AND restaurant_id IS NULL
  ) THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('rider', NEW.id, NEW.user_id, 0);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_wallet_on_restaurant_manager()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.manager_user_id IS NOT NULL AND (OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id) THEN
    IF EXISTS (
      SELECT 1 FROM wallets
      WHERE party_type = 'restaurant'
        AND party_id IS NOT DISTINCT FROM NEW.id
    ) THEN
      UPDATE wallets SET user_id = NEW.manager_user_id, updated_at = now()
      WHERE party_type = 'restaurant' AND party_id = NEW.id;
    ELSE
      INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
      VALUES ('restaurant', NEW.id, NEW.manager_user_id, NEW.id, 0);
    END IF;
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
  rest_id UUID;
BEGIN
  IF NEW.role = 'rider' THEN
    SELECT id INTO r_id FROM riders WHERE user_id = NEW.user_id LIMIT 1;
    IF r_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM wallets WHERE party_type = 'rider' AND party_id = r_id AND restaurant_id IS NULL
    ) THEN
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', r_id, NEW.user_id, 0);
    END IF;
  END IF;

  IF NEW.role = 'restaurant_manager' THEN
    FOR rest_id IN SELECT id FROM restaurants WHERE manager_user_id = NEW.user_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM wallets WHERE party_type = 'restaurant' AND party_id = rest_id
      ) THEN
        INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
        VALUES ('restaurant', rest_id, NEW.user_id, rest_id, 0);
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

CREATE OR REPLACE FUNCTION public.create_rider_wallet_on_restaurant_assign()
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
      AND restaurant_id IS NOT DISTINCT FROM NEW.restaurant_id
  ) THEN
    INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
    VALUES ('rider', NEW.rider_id, r_user_id, NEW.restaurant_id, 0);
  END IF;
  RETURN NEW;
END;
$function$;