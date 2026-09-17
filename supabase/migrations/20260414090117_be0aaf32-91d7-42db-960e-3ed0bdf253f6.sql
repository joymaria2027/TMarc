
-- Allow delivery_id to be nullable for wallet-related alerts
ALTER TABLE public.delivery_alerts ALTER COLUMN delivery_id DROP NOT NULL;

-- Update process_withdrawal_completion to not need a dummy delivery_id
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w RECORD;
  party_name TEXT;
BEGIN
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

    -- Alert for the wallet owner (withdrawal processed)
    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_completed',
      'Your withdrawal of D ' || NEW.amount || ' has been processed via ' || COALESCE(NEW.payout_method, 'N/A'));

    -- Alert visible to admins/accountants
    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_completed',
      'Withdrawal of D ' || NEW.amount || ' completed for ' || COALESCE(party_name, 'unknown') || ' via ' || COALESCE(NEW.payout_method, 'N/A'));
  END IF;

  -- Handle rejection
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
$$;

-- Trigger for new withdrawal request submissions
CREATE OR REPLACE FUNCTION public.notify_withdrawal_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w RECORD;
  party_name TEXT;
BEGIN
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
    COALESCE(party_name, 'Unknown') || ' requested a withdrawal of D ' || NEW.amount || '. Please review and process.');

  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_withdrawal_submitted_trigger
  AFTER INSERT ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_withdrawal_submitted();
