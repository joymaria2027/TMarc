-- Update process_withdrawal_completion: only debit wallet on final 'completed', alert on each step
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
  -- Step 1: Accountant initial approval
  IF NEW.status = 'accountant_approved' AND OLD.status IS DISTINCT FROM 'accountant_approved' THEN
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
      'Withdrawal of D ' || NEW.amount || ' for ' || COALESCE(party_name, 'unknown') || ' approved by accountant. Awaiting restaurant manager final approval.');
  END IF;

  -- Step 2: Final approval (completed) — only now debit wallet & record transaction
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
      'Withdrawal of D ' || NEW.amount || ' completed for ' || COALESCE(party_name, 'unknown') || ' via ' || COALESCE(NEW.payout_method, 'N/A'));
  END IF;

  -- Rejection (any stage)
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

-- Allow restaurant managers to view & update withdrawal requests for wallets they own
CREATE POLICY "Restaurant managers can view withdrawal requests for their wallets"
ON public.withdrawal_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.wallets w
    JOIN public.restaurants r ON r.id = w.party_id
    WHERE w.id = withdrawal_requests.wallet_id
      AND w.party_type = 'restaurant'
      AND r.manager_user_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1 FROM public.wallets w
    WHERE w.id = withdrawal_requests.wallet_id
      AND w.party_type = 'rider'
      AND has_role(auth.uid(), 'restaurant_manager')
  )
);

CREATE POLICY "Restaurant managers can finalize withdrawal requests"
ON public.withdrawal_requests
FOR UPDATE
USING (has_role(auth.uid(), 'restaurant_manager'));
