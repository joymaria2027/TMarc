-- 1. allow wallet credit alert types
ALTER TABLE public.delivery_alerts DROP CONSTRAINT IF EXISTS delivery_alerts_alert_type_check;
ALTER TABLE public.delivery_alerts ADD CONSTRAINT delivery_alerts_alert_type_check
CHECK (alert_type = ANY (ARRAY['late_delivery','route_deviation','suspicious','duplicate','out_of_area','delivery_completed','withdrawal_request','withdrawal_completed','withdrawal_rejected','new_order','order_ready','payment_received','wallet_credit','wallet_credit_corrected']));

-- 2. backfill run tables
CREATE TABLE public.wallet_backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_by uuid NOT NULL,
  range_from timestamptz,
  range_to timestamptz,
  merchant_id uuid,
  total_orders integer NOT NULL DEFAULT 0,
  credited_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  credited_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_backfill_runs TO authenticated;
GRANT ALL ON public.wallet_backfill_runs TO service_role;
ALTER TABLE public.wallet_backfill_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and accountants view backfill runs" ON public.wallet_backfill_runs
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'app_developer')
);

CREATE TABLE public.wallet_backfill_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.wallet_backfill_runs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_reference text,
  merchant_id uuid,
  outcome text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_backfill_results_run ON public.wallet_backfill_results(run_id);
GRANT SELECT ON public.wallet_backfill_results TO authenticated;
GRANT ALL ON public.wallet_backfill_results TO service_role;
ALTER TABLE public.wallet_backfill_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and accountants view backfill results" ON public.wallet_backfill_results
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'app_developer')
);

-- 3. reconciliation report
CREATE OR REPLACE FUNCTION public.payment_reconciliation_report(
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _merchant_id uuid DEFAULT NULL
) RETURNS TABLE(
  order_id uuid,
  order_reference text,
  merchant_id uuid,
  merchant_name text,
  paid_at timestamptz,
  payment_provider text,
  payment_reference text,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  expected_credit numeric,
  credited_amount numeric,
  credited_at timestamptz,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id,
         o.order_reference,
         o.merchant_id,
         m.name,
         o.updated_at,
         o.payment_provider,
         o.payment_reference,
         ROUND(COALESCE(o.subtotal,0),2),
         ROUND(COALESCE(o.delivery_fee,0),2),
         ROUND(COALESCE(o.total,0),2),
         ROUND(COALESCE(o.subtotal,0),2) AS expected_credit,
         wt.amount,
         wt.created_at,
         CASE
           WHEN wt.id IS NULL THEN 'missing'
           WHEN ROUND(wt.amount,2) = ROUND(COALESCE(o.subtotal,0),2) THEN 'credited'
           ELSE 'mismatch'
         END AS status
  FROM orders o
  LEFT JOIN merchants m ON m.id = o.merchant_id
  LEFT JOIN LATERAL (
    SELECT t.id, t.amount, t.created_at
    FROM wallet_transactions t
    WHERE t.order_id = o.id AND t.type = 'credit'
    ORDER BY t.created_at LIMIT 1
  ) wt ON true
  WHERE o.payment_status = 'paid'
    AND (_from IS NULL OR o.created_at >= _from)
    AND (_to IS NULL OR o.created_at < _to)
    AND (_merchant_id IS NULL OR o.merchant_id = _merchant_id)
    AND (
      public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'accountant')
      OR public.has_role(auth.uid(),'app_developer')
      OR public.has_role(auth.uid(),'business_owner')
    )
  ORDER BY o.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.payment_reconciliation_report(timestamptz,timestamptz,uuid) FROM anon;

-- 4. idempotent crediting with outcome + merchant notification
DROP FUNCTION IF EXISTS public.credit_merchant_for_order(uuid);
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

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL,
    CASE WHEN _source = 'backfill' THEN 'wallet_credit_corrected' ELSE 'wallet_credit' END,
    'Payment received for order ' || COALESCE(o.order_reference, LEFT(o.id::text,8))
      || ' — D ' || to_char(amt,'FM999999990.00') || ' credited to the merchant wallet'
      || CASE WHEN _source = 'backfill' THEN ' (applied by backfill)' ELSE '' END);

  RETURN 'credited';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.credit_merchant_for_order(uuid, text) FROM anon, authenticated;

-- 5. backfill runner
CREATE OR REPLACE FUNCTION public.run_wallet_backfill(
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _merchant_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  run_id uuid; r RECORD; res text; amt numeric;
  c_total int := 0; c_credit int := 0; c_skip int := 0; c_fail int := 0; sum_amt numeric := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  INSERT INTO wallet_backfill_runs (run_by, range_from, range_to, merchant_id)
  VALUES (auth.uid(), _from, _to, _merchant_id) RETURNING id INTO run_id;

  FOR r IN
    SELECT o.id, o.order_reference, o.merchant_id, ROUND(COALESCE(o.subtotal,0),2) AS subtotal
    FROM orders o
    WHERE o.payment_status = 'paid'
      AND (_from IS NULL OR o.created_at >= _from)
      AND (_to IS NULL OR o.created_at < _to)
      AND (_merchant_id IS NULL OR o.merchant_id = _merchant_id)
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions wt WHERE wt.order_id = o.id AND wt.type = 'credit'
      )
    ORDER BY o.created_at
  LOOP
    c_total := c_total + 1;
    amt := 0;
    BEGIN
      res := public.credit_merchant_for_order(r.id, 'backfill');
      IF res = 'credited' THEN
        c_credit := c_credit + 1; amt := r.subtotal; sum_amt := sum_amt + r.subtotal;
      ELSIF res = 'skipped' THEN
        c_skip := c_skip + 1;
      ELSE
        c_fail := c_fail + 1;
      END IF;
      INSERT INTO wallet_backfill_results (run_id, order_id, order_reference, merchant_id, outcome, amount)
      VALUES (run_id, r.id, r.order_reference, r.merchant_id, res, amt);
    EXCEPTION WHEN OTHERS THEN
      c_fail := c_fail + 1;
      INSERT INTO wallet_backfill_results (run_id, order_id, order_reference, merchant_id, outcome, amount, detail)
      VALUES (run_id, r.id, r.order_reference, r.merchant_id, 'failed', 0, SQLERRM);
    END;
  END LOOP;

  UPDATE wallet_backfill_runs
  SET total_orders = c_total, credited_count = c_credit, skipped_count = c_skip,
      failed_count = c_fail, credited_amount = sum_amt
  WHERE id = run_id;

  RETURN run_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.run_wallet_backfill(timestamptz,timestamptz,uuid) FROM anon;