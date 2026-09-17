
-- Create a function that auto-creates wallets when a role is assigned
CREATE OR REPLACE FUNCTION public.create_wallet_on_role_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r_id UUID;
  rest_id UUID;
BEGIN
  -- Rider: create wallet linked to their rider record
  IF NEW.role = 'rider' THEN
    SELECT id INTO r_id FROM riders WHERE user_id = NEW.user_id LIMIT 1;
    IF r_id IS NOT NULL THEN
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', r_id, NEW.user_id, 0)
      ON CONFLICT (party_type, party_id) DO NOTHING;
    END IF;
  END IF;

  -- Restaurant manager: create wallet for each restaurant they manage
  IF NEW.role = 'restaurant_manager' THEN
    FOR rest_id IN SELECT id FROM restaurants WHERE manager_user_id = NEW.user_id
    LOOP
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('restaurant', rest_id, NEW.user_id, 0)
      ON CONFLICT (party_type, party_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Business owner: gets UCS Rides wallet
  IF NEW.role = 'business_owner' THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('ucs_rides', NULL, NEW.user_id, 0)
    ON CONFLICT (party_type, party_id) DO NOTHING;
  END IF;

  -- App developer: gets Platform wallet
  IF NEW.role = 'app_developer' THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('platform', NULL, NEW.user_id, 0)
    ON CONFLICT (party_type, party_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on user_roles insert
CREATE TRIGGER trg_create_wallet_on_role
AFTER INSERT ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_on_role_assign();

-- Also create wallets for riders when a rider record is created
CREATE OR REPLACE FUNCTION public.create_wallet_on_rider_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO wallets (party_type, party_id, user_id, balance)
  VALUES ('rider', NEW.id, NEW.user_id, 0)
  ON CONFLICT (party_type, party_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_wallet_on_rider
AFTER INSERT ON public.riders
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_on_rider_create();

-- Also create wallets when a restaurant gets a manager assigned
CREATE OR REPLACE FUNCTION public.create_wallet_on_restaurant_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.manager_user_id IS NOT NULL AND (OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id) THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('restaurant', NEW.id, NEW.manager_user_id, 0)
    ON CONFLICT (party_type, party_id) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_wallet_on_restaurant_manager
AFTER INSERT OR UPDATE ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_on_restaurant_manager();

-- Backfill: create wallets for all existing users who don't have one yet
-- Riders
INSERT INTO wallets (party_type, party_id, user_id, balance)
SELECT 'rider', r.id, r.user_id, 0
FROM riders r
WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w.party_type = 'rider' AND w.party_id = r.id)
ON CONFLICT (party_type, party_id) DO NOTHING;

-- Restaurants with managers
INSERT INTO wallets (party_type, party_id, user_id, balance)
SELECT 'restaurant', rest.id, rest.manager_user_id, 0
FROM restaurants rest
WHERE rest.manager_user_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.party_type = 'restaurant' AND w.party_id = rest.id)
ON CONFLICT (party_type, party_id) DO NOTHING;

-- Business owners (UCS Rides wallet)
INSERT INTO wallets (party_type, party_id, user_id, balance)
SELECT 'ucs_rides', NULL, ur.user_id, 0
FROM user_roles ur
WHERE ur.role = 'business_owner'
AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.party_type = 'ucs_rides')
ON CONFLICT (party_type, party_id) DO NOTHING;

-- App developers (Platform wallet)
INSERT INTO wallets (party_type, party_id, user_id, balance)
SELECT 'platform', NULL, ur.user_id, 0
FROM user_roles ur
WHERE ur.role = 'app_developer'
AND NOT EXISTS (SELECT 1 FROM wallets w WHERE w.party_type = 'platform')
ON CONFLICT (party_type, party_id) DO NOTHING;
