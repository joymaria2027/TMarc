
-- 0. Deduplicate platform / ucs_rides / restaurant wallets (keep oldest, sum balances, repoint transactions)
DO $$
DECLARE
  keep_id uuid;
  dup_rec RECORD;
BEGIN
  FOR dup_rec IN
    SELECT party_type, party_id, COUNT(*) AS cnt
    FROM public.wallets
    GROUP BY party_type, party_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keep_id FROM public.wallets
    WHERE party_type = dup_rec.party_type
      AND (party_id = dup_rec.party_id OR (party_id IS NULL AND dup_rec.party_id IS NULL))
    ORDER BY created_at ASC LIMIT 1;

    -- Sum other balances into keep
    UPDATE public.wallets SET balance = (
      SELECT COALESCE(SUM(balance), 0) FROM public.wallets
      WHERE party_type = dup_rec.party_type
        AND (party_id = dup_rec.party_id OR (party_id IS NULL AND dup_rec.party_id IS NULL))
    ) WHERE id = keep_id;

    -- Repoint transactions
    UPDATE public.wallet_transactions SET wallet_id = keep_id
    WHERE wallet_id IN (
      SELECT id FROM public.wallets
      WHERE party_type = dup_rec.party_type
        AND (party_id = dup_rec.party_id OR (party_id IS NULL AND dup_rec.party_id IS NULL))
        AND id <> keep_id
    );

    -- Repoint withdrawal_requests
    UPDATE public.withdrawal_requests SET wallet_id = keep_id
    WHERE wallet_id IN (
      SELECT id FROM public.wallets
      WHERE party_type = dup_rec.party_type
        AND (party_id = dup_rec.party_id OR (party_id IS NULL AND dup_rec.party_id IS NULL))
        AND id <> keep_id
    );

    -- Delete dups
    DELETE FROM public.wallets
    WHERE party_type = dup_rec.party_type
      AND (party_id = dup_rec.party_id OR (party_id IS NULL AND dup_rec.party_id IS NULL))
      AND id <> keep_id;
  END LOOP;
END $$;

-- 1. Add restaurant_id to wallets
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS restaurant_id uuid;

-- 2. Drop old unique constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_party_type_party_id_key') THEN
    ALTER TABLE public.wallets DROP CONSTRAINT wallets_party_type_party_id_key;
  END IF;
END $$;

-- For restaurant wallets: set restaurant_id = party_id
UPDATE public.wallets SET restaurant_id = party_id WHERE party_type = 'restaurant' AND restaurant_id IS NULL;

-- 3. Backfill rider wallets: split per-restaurant based on transaction history
DO $$
DECLARE
  rw RECORD;
  rest_rec RECORD;
  new_wallet_id uuid;
  rest_count int;
  first_rest uuid;
BEGIN
  FOR rw IN
    SELECT w.* FROM public.wallets w
    WHERE w.party_type = 'rider' AND w.restaurant_id IS NULL
  LOOP
    SELECT COUNT(DISTINCT d.restaurant_id) INTO rest_count
    FROM public.wallet_transactions wt
    JOIN public.deliveries d ON d.id = wt.delivery_id
    WHERE wt.wallet_id = rw.id AND wt.type = 'credit' AND d.restaurant_id IS NOT NULL;

    IF rest_count <= 1 THEN
      SELECT d.restaurant_id INTO first_rest
      FROM public.wallet_transactions wt
      JOIN public.deliveries d ON d.id = wt.delivery_id
      WHERE wt.wallet_id = rw.id AND d.restaurant_id IS NOT NULL
      LIMIT 1;

      IF first_rest IS NOT NULL THEN
        UPDATE public.wallets SET restaurant_id = first_rest WHERE id = rw.id;
      END IF;
    ELSE
      first_rest := NULL;
      FOR rest_rec IN
        SELECT d.restaurant_id AS rid,
               SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE -wt.amount END) AS net_balance
        FROM public.wallet_transactions wt
        JOIN public.deliveries d ON d.id = wt.delivery_id
        WHERE wt.wallet_id = rw.id AND d.restaurant_id IS NOT NULL
        GROUP BY d.restaurant_id
        ORDER BY d.restaurant_id
      LOOP
        IF first_rest IS NULL THEN
          UPDATE public.wallets
          SET restaurant_id = rest_rec.rid, balance = GREATEST(rest_rec.net_balance, 0)
          WHERE id = rw.id;
          first_rest := rest_rec.rid;
        ELSE
          INSERT INTO public.wallets (party_type, party_id, user_id, restaurant_id, balance)
          VALUES ('rider', rw.party_id, rw.user_id, rest_rec.rid, GREATEST(rest_rec.net_balance, 0))
          RETURNING id INTO new_wallet_id;

          UPDATE public.wallet_transactions wt
          SET wallet_id = new_wallet_id
          FROM public.deliveries d
          WHERE wt.delivery_id = d.id
            AND wt.wallet_id = rw.id
            AND d.restaurant_id = rest_rec.rid;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 4. Unique index across (party_type, party_id, restaurant_id) treating NULLs as values
CREATE UNIQUE INDEX IF NOT EXISTS wallets_party_restaurant_unique
ON public.wallets (party_type, COALESCE(party_id::text, 'null'), COALESCE(restaurant_id::text, 'null'));

-- 5. Update credit_wallets_on_settlement
CREATE OR REPLACE FUNCTION public.credit_wallets_on_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN
      SELECT * INTO rev FROM revenue_sharing WHERE restaurant_id = NEW.restaurant_id LIMIT 1;
    END IF;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
    order_ref := COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8));
    effective_rider_id := COALESCE(rev.rider_id, NEW.rider_id);

    total_expenses := 0;
    IF effective_rider_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO total_expenses
      FROM rider_expenses
      WHERE rider_id = effective_rider_id
        AND restaurant_id = NEW.restaurant_id
        AND status IN ('approved', 'verified')
        AND deducted_in_delivery_id IS NULL;

      IF total_expenses > 0 THEN
        UPDATE rider_expenses
        SET deducted_in_delivery_id = NEW.id
        WHERE rider_id = effective_rider_id
          AND restaurant_id = NEW.restaurant_id
          AND status IN ('approved', 'verified')
          AND deducted_in_delivery_id IS NULL;
      END IF;
    END IF;

    net_income := GREATEST(tariff_total - total_expenses, 0);

    -- Rider per-restaurant wallet
    IF effective_rider_id IS NOT NULL AND rev.rider_percentage > 0 THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = effective_rider_id;
      SELECT id INTO w_id FROM wallets
      WHERE party_type = 'rider' AND party_id = effective_rider_id AND restaurant_id = NEW.restaurant_id;

      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
        VALUES ('rider', effective_rider_id, rider_user, NEW.restaurant_id, (net_income * rev.rider_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.rider_percentage / 100), updated_at = now()
        WHERE id = w_id;
      END IF;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.rider_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.rider_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    -- Restaurant wallet
    IF NEW.restaurant_id IS NOT NULL AND rev.restaurant_percentage > 0 THEN
      SELECT manager_user_id INTO rest_manager FROM restaurants WHERE id = NEW.restaurant_id;
      SELECT id INTO w_id FROM wallets
      WHERE party_type = 'restaurant' AND party_id = NEW.restaurant_id;

      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
        VALUES ('restaurant', NEW.restaurant_id, rest_manager, NEW.restaurant_id, (net_income * rev.restaurant_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.restaurant_percentage / 100), updated_at = now()
        WHERE id = w_id;
      END IF;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.restaurant_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.restaurant_percentage || '% of D' || net_income || ' after D' || total_expenses || ' expenses)', NEW.id);
    END IF;

    -- UCS Rides wallet
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

    -- Platform wallet
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

-- 6. Pre-create rider wallet on restaurant assignment
CREATE OR REPLACE FUNCTION public.create_rider_wallet_on_restaurant_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r_user_id uuid;
BEGIN
  SELECT user_id INTO r_user_id FROM riders WHERE id = NEW.rider_id;
  INSERT INTO wallets (party_type, party_id, user_id, restaurant_id, balance)
  VALUES ('rider', NEW.rider_id, r_user_id, NEW.restaurant_id, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_rider_wallet_on_assign ON public.restaurant_riders;
CREATE TRIGGER trg_create_rider_wallet_on_assign
AFTER INSERT ON public.restaurant_riders
FOR EACH ROW EXECUTE FUNCTION public.create_rider_wallet_on_restaurant_assign();

-- 7. Backfill empty wallets for existing rider/restaurant pairs
INSERT INTO public.wallets (party_type, party_id, user_id, restaurant_id, balance)
SELECT 'rider', rr.rider_id, r.user_id, rr.restaurant_id, 0
FROM public.restaurant_riders rr
JOIN public.riders r ON r.id = rr.rider_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallets w
  WHERE w.party_type = 'rider' AND w.party_id = rr.rider_id AND w.restaurant_id = rr.restaurant_id
);

-- 8. RLS: Restaurant managers can view rider wallets for their restaurants
DROP POLICY IF EXISTS "Restaurant managers can view rider wallets for their restaurants" ON public.wallets;
CREATE POLICY "Restaurant managers can view rider wallets for their restaurants"
ON public.wallets FOR SELECT
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role)
  AND party_type = 'rider'
  AND restaurant_id IN (SELECT id FROM restaurants WHERE manager_user_id = auth.uid())
);

-- 9. Revenue sharing: Business owner full access + Admin delete
DROP POLICY IF EXISTS "Business owners can view sharing" ON public.revenue_sharing;
CREATE POLICY "Business owners can view sharing"
ON public.revenue_sharing FOR SELECT
USING (has_role(auth.uid(), 'business_owner'::app_role));

DROP POLICY IF EXISTS "Business owners can insert sharing" ON public.revenue_sharing;
CREATE POLICY "Business owners can insert sharing"
ON public.revenue_sharing FOR INSERT
WITH CHECK (has_role(auth.uid(), 'business_owner'::app_role));

DROP POLICY IF EXISTS "Business owners can update sharing" ON public.revenue_sharing;
CREATE POLICY "Business owners can update sharing"
ON public.revenue_sharing FOR UPDATE
USING (has_role(auth.uid(), 'business_owner'::app_role));

DROP POLICY IF EXISTS "Business owners can delete sharing" ON public.revenue_sharing;
CREATE POLICY "Business owners can delete sharing"
ON public.revenue_sharing FOR DELETE
USING (has_role(auth.uid(), 'business_owner'::app_role));

DROP POLICY IF EXISTS "Admins can delete sharing" ON public.revenue_sharing;
CREATE POLICY "Admins can delete sharing"
ON public.revenue_sharing FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
