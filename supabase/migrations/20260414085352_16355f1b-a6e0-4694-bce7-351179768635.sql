
-- Create wallets table
CREATE TABLE public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  party_type TEXT NOT NULL, -- 'rider', 'restaurant', 'platform'
  party_id UUID, -- rider.id or restaurant.id, NULL for platform
  user_id UUID, -- the auth user who owns this wallet (for RLS)
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(party_type, party_id)
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets" ON public.wallets FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all wallets" ON public.wallets FOR SELECT
  USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Business owners can view all wallets" ON public.wallets FOR SELECT
  USING (has_role(auth.uid(), 'business_owner'::app_role));

CREATE POLICY "Admins can update wallets" ON public.wallets FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can update wallets" ON public.wallets FOR UPDATE
  USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "System can insert wallets" ON public.wallets FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role));

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create withdrawal_requests table
CREATE TABLE public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  requested_by UUID NOT NULL, -- auth user id
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, rejected
  payout_method TEXT, -- filled by accountant
  payout_reference TEXT, -- filled by accountant
  notes TEXT,
  processed_by UUID, -- accountant user id
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawal requests" ON public.withdrawal_requests FOR SELECT
  USING (auth.uid() = requested_by);

CREATE POLICY "Admins can view all withdrawal requests" ON public.withdrawal_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all withdrawal requests" ON public.withdrawal_requests FOR SELECT
  USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Business owners can view all withdrawal requests" ON public.withdrawal_requests FOR SELECT
  USING (has_role(auth.uid(), 'business_owner'::app_role));

CREATE POLICY "Users can insert own withdrawal requests" ON public.withdrawal_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Accountants can update withdrawal requests" ON public.withdrawal_requests FOR UPDATE
  USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Admins can update withdrawal requests" ON public.withdrawal_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to credit wallets from revenue sharing when settlement is approved
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
BEGIN
  -- Only fire when settlement_approved flips to true
  IF NEW.settlement_approved = true AND (OLD.settlement_approved IS DISTINCT FROM true) THEN
    -- Get the revenue sharing record for this delivery
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);

    -- Credit rider wallet
    IF rev.rider_id IS NOT NULL THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = rev.rider_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', rev.rider_id, rider_user, (tariff_total * rev.rider_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now();
    END IF;

    -- Credit restaurant wallet
    IF rev.restaurant_id IS NOT NULL THEN
      SELECT manager_user_id INTO rest_manager FROM restaurants WHERE id = rev.restaurant_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('restaurant', rev.restaurant_id, rest_manager, (tariff_total * rev.restaurant_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now();
    END IF;

    -- Credit platform wallet
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('platform', NULL, NULL, (tariff_total * rev.platform_percentage / 100))
    ON CONFLICT (party_type, party_id)
    DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_wallets_trigger
  AFTER UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.credit_wallets_on_settlement();

-- Function to deduct wallet balance and create alert on withdrawal completion
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
    -- Deduct from wallet
    UPDATE wallets SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;

    -- Get wallet info for alert
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;

    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'restaurant' THEN
      SELECT name INTO party_name FROM restaurants WHERE id = w.party_id;
    ELSE
      party_name := 'Platform';
    END IF;

    -- Create a delivery alert (using a dummy delivery_id from latest delivery)
    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    SELECT d.id, 'withdrawal_completed',
      'Withdrawal of ' || NEW.amount || ' completed for ' || COALESCE(party_name, 'unknown') || ' via ' || COALESCE(NEW.payout_method, 'N/A')
    FROM deliveries d ORDER BY d.created_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER process_withdrawal_trigger
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.process_withdrawal_completion();

-- Enable realtime for wallet tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.withdrawal_requests;
