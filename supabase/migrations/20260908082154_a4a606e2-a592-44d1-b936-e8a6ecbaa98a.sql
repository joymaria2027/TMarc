ALTER TABLE public.delivery_alerts ADD COLUMN IF NOT EXISTS merchant_id uuid;

DROP POLICY IF EXISTS "Managers view own restaurant alerts" ON public.delivery_alerts;
CREATE POLICY "Managers view own restaurant alerts" ON public.delivery_alerts
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'company_manager'::app_role) AND (
    (merchant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM merchants m WHERE m.id = delivery_alerts.merchant_id AND m.manager_user_id = auth.uid()
    ))
    OR (merchant_id IS NULL AND delivery_id IS NULL)
    OR (delivery_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM deliveries d JOIN merchants r ON r.id = d.merchant_id
      WHERE d.id = delivery_alerts.delivery_id AND r.manager_user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Accountants view own restaurant alerts" ON public.delivery_alerts;
CREATE POLICY "Accountants view own restaurant alerts" ON public.delivery_alerts
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'accountant'::app_role) AND (
    (merchant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM merchants m WHERE m.id = delivery_alerts.merchant_id AND m.accountant_user_id = auth.uid()
    ))
    OR (merchant_id IS NULL AND delivery_id IS NULL)
    OR (delivery_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM deliveries d JOIN merchants r ON r.id = d.merchant_id
      WHERE d.id = delivery_alerts.delivery_id AND r.accountant_user_id = auth.uid()
    ))
  )
);

CREATE OR REPLACE FUNCTION public.credit_merchant_for_order(_order_id uuid, _source text DEFAULT 'live')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o RECORD; mgr uuid; w_id uuid; amt numeric; label text;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF o IS NULL THEN RETURN 'not_found'; END IF;
  amt := ROUND(COALESCE(o.subtotal,0), 2);
  IF amt <= 0 THEN RETURN 'zero_amount'; END IF;

  SELECT manager_user_id INTO mgr FROM merchants WHERE id = o.merchant_id;
  SELECT id INTO w_id FROM wallets WHERE party_type = 'merchant' AND party_id = o.merchant_id LIMIT 1;
  IF w_id IS NULL THEN
    INSERT INTO wallets (party_type, party_id, user_id, merchant_id, balance)
    VALUES ('merchant', o.merchant_id, mgr, o.merchant_id, 0) RETURNING id INTO w_id;
  END IF;

  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE wallet_id = w_id AND order_id = _order_id AND type = 'credit') THEN
    RETURN 'skipped';
  END IF;

  label := 'Product sales for order ' || COALESCE(o.order_reference, LEFT(o.id::text,8))
           || ' (goods subtotal, delivery fee excluded)'
           || CASE WHEN _source = 'backfill' THEN ' [backfill]' ELSE '' END;

  BEGIN
    INSERT INTO wallet_transactions (wallet_id, type, amount, description, order_id)
    VALUES (w_id, 'credit', amt, label, _order_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'skipped';
  END;

  UPDATE wallets SET balance = balance + amt, updated_at = now() WHERE id = w_id;

  INSERT INTO delivery_alerts (delivery_id, merchant_id, alert_type, message)
  VALUES (NULL, o.merchant_id,
    CASE WHEN _source = 'backfill' THEN 'wallet_credit_corrected' ELSE 'wallet_credit' END,
    'Payment received for order ' || COALESCE(o.order_reference, LEFT(o.id::text,8))
      || ' — D ' || to_char(amt,'FM999999990.00') || ' credited to the merchant wallet'
      || CASE WHEN _source = 'backfill' THEN ' (applied by backfill)' ELSE '' END);

  RETURN 'credited';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.credit_merchant_for_order(uuid, text) FROM anon, authenticated;