
-- Create wallet_transactions table
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  type TEXT NOT NULL, -- 'credit' or 'debit'
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  delivery_id UUID REFERENCES public.deliveries(id),
  withdrawal_request_id UUID REFERENCES public.withdrawal_requests(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet transactions" ON public.wallet_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM wallets w WHERE w.id = wallet_transactions.wallet_id AND w.user_id = auth.uid()));

CREATE POLICY "Admins can view all wallet transactions" ON public.wallet_transactions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all wallet transactions" ON public.wallet_transactions FOR SELECT
  USING (has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Business owners can view all wallet transactions" ON public.wallet_transactions FOR SELECT
  USING (has_role(auth.uid(), 'business_owner'::app_role));

-- No direct insert by users; only via triggers
CREATE INDEX idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;

-- Replace credit_wallets_on_settlement to also log transactions
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
  w_id UUID;
  order_ref TEXT;
BEGIN
  IF NEW.settlement_approved = true AND (OLD.settlement_approved IS DISTINCT FROM true) THEN
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
    order_ref := COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8));

    -- Credit rider wallet
    IF rev.rider_id IS NOT NULL THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = rev.rider_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('rider', rev.rider_id, rider_user, (tariff_total * rev.rider_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', tariff_total * rev.rider_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.rider_percentage || '%)', NEW.id);
    END IF;

    -- Credit restaurant wallet
    IF rev.restaurant_id IS NOT NULL THEN
      SELECT manager_user_id INTO rest_manager FROM restaurants WHERE id = rev.restaurant_id;
      INSERT INTO wallets (party_type, party_id, user_id, balance)
      VALUES ('restaurant', rev.restaurant_id, rest_manager, (tariff_total * rev.restaurant_percentage / 100))
      ON CONFLICT (party_type, party_id)
      DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
      RETURNING id INTO w_id;

      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', tariff_total * rev.restaurant_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.restaurant_percentage || '%)', NEW.id);
    END IF;

    -- Credit platform wallet
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('platform', NULL, NULL, (tariff_total * rev.platform_percentage / 100))
    ON CONFLICT (party_type, party_id)
    DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = now()
    RETURNING id INTO w_id;

    INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
    VALUES (w_id, 'credit', tariff_total * rev.platform_percentage / 100,
      'Revenue from delivery ' || order_ref || ' (' || rev.platform_percentage || '%)', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Replace process_withdrawal_completion to also log transactions
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

    -- Log debit transaction
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
    SELECT d.id, 'withdrawal_completed',
      'Withdrawal of ' || NEW.amount || ' completed for ' || COALESCE(party_name, 'unknown') || ' via ' || COALESCE(NEW.payout_method, 'N/A')
    FROM deliveries d ORDER BY d.created_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
