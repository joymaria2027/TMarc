
-- 1. reject_delivery: dedup guard + require online
CREATE OR REPLACE FUNCTION public.reject_delivery(_delivery_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_rider_id uuid;
BEGIN
  SELECT id INTO my_rider_id FROM riders
  WHERE user_id = auth.uid() AND is_active = true AND is_online = true LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not an active and online rider';
  END IF;

  IF EXISTS (SELECT 1 FROM delivery_rejections WHERE delivery_id = _delivery_id AND rider_id = my_rider_id) THEN
    RAISE EXCEPTION 'ALREADY_REJECTED';
  END IF;

  INSERT INTO delivery_rejections (delivery_id, rider_id)
  VALUES (_delivery_id, my_rider_id);

  UPDATE deliveries
  SET rider_id = NULL,
      status = 'unassigned',
      dispatched_at = NULL
  WHERE id = _delivery_id
    AND (rider_id = my_rider_id OR rider_id IS NULL);

  RETURN true;
END;
$function$;

-- 2. claim_delivery: require online
CREATE OR REPLACE FUNCTION public.claim_delivery(_delivery_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_rider_id uuid;
  updated_count int;
BEGIN
  SELECT id INTO my_rider_id FROM riders
  WHERE user_id = auth.uid() AND is_active = true AND is_online = true LIMIT 1;
  IF my_rider_id IS NULL THEN
    RAISE EXCEPTION 'Not an active and online rider';
  END IF;

  UPDATE deliveries
  SET rider_id = my_rider_id,
      status = 'dispatched',
      dispatched_at = now()
  WHERE id = _delivery_id
    AND status = 'unassigned'
    AND rider_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$function$;

-- 3. get_offered_deliveries: require online
CREATE OR REPLACE FUNCTION public.get_offered_deliveries()
 RETURNS SETOF deliveries
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.*
  FROM deliveries d
  WHERE d.status = 'unassigned'
    AND d.rider_id IS NULL
    AND EXISTS (SELECT 1 FROM riders r WHERE r.user_id = auth.uid() AND r.is_active = true AND r.is_online = true)
    AND NOT EXISTS (
      SELECT 1 FROM delivery_rejections dr
      JOIN riders r ON r.id = dr.rider_id
      WHERE dr.delivery_id = d.id AND r.user_id = auth.uid()
    )
  ORDER BY d.created_at DESC;
$function$;

-- 4. RLS on deliveries: require is_online = true
DROP POLICY IF EXISTS "Active riders can view unassigned deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Active riders can claim unassigned deliveries" ON public.deliveries;

CREATE POLICY "Active riders can view unassigned deliveries"
ON public.deliveries
FOR SELECT
USING (
  status = 'unassigned' AND rider_id IS NULL AND EXISTS (
    SELECT 1 FROM riders r WHERE r.user_id = auth.uid() AND r.is_active = true AND r.is_online = true
  )
);

CREATE POLICY "Active riders can claim unassigned deliveries"
ON public.deliveries
FOR UPDATE
USING (
  status = 'unassigned' AND rider_id IS NULL AND EXISTS (
    SELECT 1 FROM riders r WHERE r.user_id = auth.uid() AND r.is_active = true AND r.is_online = true
  )
)
WITH CHECK (
  EXISTS (SELECT 1 FROM riders r WHERE r.id = deliveries.rider_id AND r.user_id = auth.uid())
);

-- 5. Withdrawal flow: manager first, then accountant.
-- New status sequence: pending -> manager_approved -> completed (or rejected at any stage).
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
  -- Step 1: Restaurant manager initial approval
  IF NEW.status = 'manager_approved' AND OLD.status IS DISTINCT FROM 'manager_approved' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'restaurant' THEN
      SELECT name INTO party_name FROM restaurants WHERE id = w.party_id;
    ELSE
      party_name := 'Platform';
    END IF;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_request',
      'Withdrawal of D ' || NEW.amount || ' for ' || COALESCE(party_name, 'unknown') ||
      ' approved by restaurant manager. Awaiting accountant final approval.');
  END IF;

  -- Step 2: Accountant final approval (completed) — debit wallet & record transaction
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE wallets SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;

    INSERT INTO wallet_transactions (wallet_id, type, amount, description, withdrawal_request_id)
    VALUES (NEW.wallet_id, 'debit', NEW.amount,
      'Withdrawal via ' || COALESCE(NEW.payout_method, 'N/A'), NEW.id);

    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;

    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'restaurant' THEN
      SELECT name INTO party_name FROM restaurants WHERE id = w.party_id;
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

  -- Rejection at any stage
  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'restaurant' THEN
      SELECT name INTO party_name FROM restaurants WHERE id = w.party_id;
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
