
-- 1. Admin delete delivery: cascade function + RLS
CREATE OR REPLACE FUNCTION public.delete_delivery_cascade(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can delete deliveries';
  END IF;

  DELETE FROM public.delivery_waypoints WHERE delivery_id = _id;
  DELETE FROM public.delivery_alerts WHERE delivery_id = _id;
  DELETE FROM public.delivery_receipts WHERE delivery_id = _id;
  DELETE FROM public.delivery_rejections WHERE delivery_id = _id;
  DELETE FROM public.delivery_holder_events WHERE delivery_id = _id;
  DELETE FROM public.revenue_sharing WHERE delivery_id = _id;
  DELETE FROM public.rider_expense_consumptions WHERE delivery_id = _id;
  UPDATE public.wallet_transactions SET delivery_id = NULL WHERE delivery_id = _id;
  UPDATE public.rider_expenses SET deducted_in_delivery_id = NULL WHERE deducted_in_delivery_id = _id;
  DELETE FROM public.payment_reconciliations WHERE delivery_id = _id;
  DELETE FROM public.deliveries WHERE id = _id;

  RETURN TRUE;
END;
$$;

CREATE POLICY "Admins can delete deliveries"
ON public.deliveries FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Reconciliation table
CREATE TABLE public.payment_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('delivery_payment','payout')),
  delivery_id UUID,
  withdrawal_request_id UUID,
  wallet_transaction_id UUID,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_reference TEXT,
  party_label TEXT,
  statement_url TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','disputed')),
  matched_by UUID,
  matched_at TIMESTAMPTZ,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recon_entry_type ON public.payment_reconciliations(entry_type);
CREATE INDEX idx_recon_status ON public.payment_reconciliations(status);
CREATE INDEX idx_recon_delivery ON public.payment_reconciliations(delivery_id);
CREATE INDEX idx_recon_withdrawal ON public.payment_reconciliations(withdrawal_request_id);

ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage reconciliations"
ON public.payment_reconciliations FOR ALL
USING (has_role(auth.uid(),'admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Accountants manage reconciliations"
ON public.payment_reconciliations FOR ALL
USING (has_role(auth.uid(),'accountant'::app_role))
WITH CHECK (has_role(auth.uid(),'accountant'::app_role));

CREATE TRIGGER trg_recon_updated_at
BEFORE UPDATE ON public.payment_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Triggers to auto-seed
CREATE OR REPLACE FUNCTION public.seed_recon_on_settlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.settlement_approved = true AND (OLD.settlement_approved IS DISTINCT FROM true) THEN
    INSERT INTO public.payment_reconciliations
      (entry_type, delivery_id, amount, payment_method, payment_reference, party_label, occurred_at)
    VALUES
      ('delivery_payment', NEW.id,
       COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0),
       NEW.payment_method,
       COALESCE(NEW.order_reference, LEFT(NEW.id::text,8)),
       NULLIF(TRIM(COALESCE(NEW.customer_name,'') || COALESCE(' / '||NEW.payment_bank_name,'')), ''),
       COALESCE(NEW.delivered_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_recon_settlement
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.seed_recon_on_settlement();

CREATE OR REPLACE FUNCTION public.seed_recon_on_payout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w RECORD;
  party_name TEXT;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'merchant' THEN
      SELECT name INTO party_name FROM merchants WHERE id = w.party_id;
    ELSE
      party_name := COALESCE(w.party_type, 'unknown');
    END IF;

    INSERT INTO public.payment_reconciliations
      (entry_type, withdrawal_request_id, amount, payment_method, payment_reference, party_label, occurred_at)
    VALUES
      ('payout', NEW.id, NEW.amount, NEW.payout_method, NEW.payout_reference, party_name, COALESCE(NEW.processed_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_recon_payout
AFTER UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.seed_recon_on_payout();

-- 4. Backfill
INSERT INTO public.payment_reconciliations
  (entry_type, delivery_id, amount, payment_method, payment_reference, party_label, occurred_at)
SELECT 'delivery_payment', d.id,
  COALESCE(d.actual_tariff, d.estimated_tariff, 0),
  d.payment_method,
  COALESCE(d.order_reference, LEFT(d.id::text,8)),
  NULLIF(TRIM(COALESCE(d.customer_name,'') || COALESCE(' / '||d.payment_bank_name,'')), ''),
  COALESCE(d.delivered_at, d.updated_at)
FROM public.deliveries d
WHERE d.settlement_approved = true;

INSERT INTO public.payment_reconciliations
  (entry_type, withdrawal_request_id, amount, payment_method, payment_reference, party_label, occurred_at)
SELECT 'payout', wr.id, wr.amount, wr.payout_method, wr.payout_reference,
  CASE w.party_type
    WHEN 'rider' THEN (SELECT p.full_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id)
    WHEN 'merchant' THEN (SELECT name FROM merchants WHERE id = w.party_id)
    ELSE w.party_type
  END,
  COALESCE(wr.processed_at, wr.updated_at)
FROM public.withdrawal_requests wr
JOIN public.wallets w ON w.id = wr.wallet_id
WHERE wr.status = 'completed';

-- 5. Storage bucket + policies
INSERT INTO storage.buckets (id, name, public) VALUES ('reconciliation-statements','reconciliation-statements', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read recon statements"
ON storage.objects FOR SELECT
USING (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Accountants read recon statements"
ON storage.objects FOR SELECT
USING (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'accountant'::app_role));

CREATE POLICY "Admins upload recon statements"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Accountants upload recon statements"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'accountant'::app_role));

CREATE POLICY "Admins update recon statements"
ON storage.objects FOR UPDATE
USING (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Accountants update recon statements"
ON storage.objects FOR UPDATE
USING (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'accountant'::app_role));

CREATE POLICY "Admins delete recon statements"
ON storage.objects FOR DELETE
USING (bucket_id = 'reconciliation-statements' AND has_role(auth.uid(),'admin'::app_role));
