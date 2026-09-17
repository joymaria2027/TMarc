-- Fix ON CONFLICT targets to match new unique index wallets_party_restaurant_unique

CREATE OR REPLACE FUNCTION public.create_wallet_on_rider_create()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO wallets (party_type, party_id, user_id, balance)
  VALUES ('rider', NEW.id, NEW.user_id, 0)
  ON CONFLICT ON CONSTRAINT wallets_party_restaurant_unique DO NOTHING;
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
    INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
    VALUES ('restaurant', NEW.id, NEW.manager_user_id, NEW.id, 0)
    ON CONFLICT ON CONSTRAINT wallets_party_restaurant_unique
    DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now();
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
    IF r_id IS NOT NULL THEN
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', r_id, NEW.user_id, 0)
      ON CONFLICT ON CONSTRAINT wallets_party_restaurant_unique DO NOTHING;
    END IF;
  END IF;

  IF NEW.role = 'restaurant_manager' THEN
    FOR rest_id IN SELECT id FROM restaurants WHERE manager_user_id = NEW.user_id
    LOOP
      INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
      VALUES ('restaurant', rest_id, NEW.user_id, rest_id, 0)
      ON CONFLICT ON CONSTRAINT wallets_party_restaurant_unique DO NOTHING;
    END LOOP;
  END IF;

  IF NEW.role = 'business_owner' THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('ucs_rides', NULL, NEW.user_id, 0)
    ON CONFLICT ON CONSTRAINT wallets_party_restaurant_unique DO NOTHING;
  END IF;

  IF NEW.role = 'app_developer' THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('platform', NULL, NEW.user_id, 0)
    ON CONFLICT ON CONSTRAINT wallets_party_restaurant_unique DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;