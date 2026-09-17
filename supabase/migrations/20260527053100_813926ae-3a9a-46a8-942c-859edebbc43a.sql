
-- =========================================================
-- Fund-leakage hardening + Systems Audit function
-- =========================================================

-- 1. Audit acknowledgements
CREATE TABLE IF NOT EXISTS public.audit_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_key text NOT NULL,
  entity_id text NOT NULL,
  acknowledged_by uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  note text,
  UNIQUE (check_key, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_acknowledgements TO authenticated;
GRANT ALL ON public.audit_acknowledgements TO service_role;
ALTER TABLE public.audit_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audit ack viewable by privileged roles"
  ON public.audit_acknowledgements FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'accountant'::app_role)
      OR has_role(auth.uid(),'business_owner'::app_role)
      OR has_role(auth.uid(),'app_developer'::app_role));

CREATE POLICY "Audit ack manageable by privileged roles"
  ON public.audit_acknowledgements FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'accountant'::app_role)
      OR has_role(auth.uid(),'business_owner'::app_role))
      AND acknowledged_by = auth.uid());

CREATE POLICY "Audit ack deletable by privileged roles"
  ON public.audit_acknowledgements FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'accountant'::app_role)
      OR has_role(auth.uid(),'business_owner'::app_role));

-- 2. Unique partial index — one credit per (wallet, delivery)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_credit_per_delivery
  ON public.wallet_transactions (wallet_id, delivery_id)
  WHERE type = 'credit' AND delivery_id IS NOT NULL;

-- 3. Trigger: block settlement_approved true -> false flip
CREATE OR REPLACE FUNCTION public.guard_settlement_reset()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.settlement_approved = true AND NEW.settlement_approved = false THEN
    RAISE EXCEPTION 'Cannot un-approve a settled delivery (would re-trigger wallet credits). Issue a refund/adjustment instead.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_settlement_reset ON public.deliveries;
CREATE TRIGGER trg_guard_settlement_reset
  BEFORE UPDATE OF settlement_approved ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_reset();

-- 4. Trigger: prevent negative wallet balance on debit
CREATE OR REPLACE FUNCTION public.guard_wallet_debit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE bal numeric;
BEGIN
  IF NEW.type = 'debit' THEN
    SELECT balance INTO bal FROM wallets WHERE id = NEW.wallet_id FOR UPDATE;
    IF bal IS NULL THEN RAISE EXCEPTION 'Wallet % not found', NEW.wallet_id; END IF;
    IF bal < NEW.amount THEN
      RAISE EXCEPTION 'Insufficient wallet balance (have %, need %)', bal, NEW.amount;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_wallet_debit ON public.wallet_transactions;
CREATE TRIGGER trg_guard_wallet_debit
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_wallet_debit();

-- 5. Trigger: clamp consumed_amount <= amount on rider_expenses
CREATE OR REPLACE FUNCTION public.guard_rider_expense_consumption()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.consumed_amount > NEW.amount THEN
    RAISE EXCEPTION 'consumed_amount (%) exceeds amount (%)', NEW.consumed_amount, NEW.amount;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_rider_expense_consumption ON public.rider_expenses;
CREATE TRIGGER trg_guard_rider_expense_consumption
  BEFORE INSERT OR UPDATE ON public.rider_expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_rider_expense_consumption();

-- 6. Trigger: revenue sharing percentages must sum to 100
CREATE OR REPLACE FUNCTION public.guard_revenue_sharing_sum()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE total numeric;
BEGIN
  total := COALESCE(NEW.rider_percentage,0) + COALESCE(NEW.merchant_percentage,0)
         + COALESCE(NEW.ucs_rides_percentage,0) + COALESCE(NEW.platform_percentage,0);
  IF ROUND(total, 2) <> 100 THEN
    RAISE EXCEPTION 'Revenue sharing percentages must sum to 100 (got %)', total;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_revenue_sharing_sum ON public.revenue_sharing;
CREATE TRIGGER trg_guard_revenue_sharing_sum
  BEFORE INSERT OR UPDATE ON public.revenue_sharing
  FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_sharing_sum();

-- 7. Fraud audit report
CREATE OR REPLACE FUNCTION public.fraud_audit_report()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO 'public' AS $$
DECLARE
  results jsonb := '[]'::jsonb;
  rec record;
  ack jsonb;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role)
       OR has_role(auth.uid(),'accountant'::app_role)
       OR has_role(auth.uid(),'business_owner'::app_role)
       OR has_role(auth.uid(),'app_developer'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Cache acknowledged entity ids
  SELECT COALESCE(jsonb_object_agg(check_key, ids),'{}'::jsonb) INTO ack
  FROM (
    SELECT check_key, jsonb_agg(entity_id) AS ids
    FROM audit_acknowledgements GROUP BY check_key
  ) s;

  -- helper macro replaced by inline appends:

  -- 1. ledger drift
  WITH drift AS (
    SELECT w.id, w.party_type, w.balance,
           COALESCE(SUM(CASE WHEN t.type='credit' THEN t.amount
                             WHEN t.type='debit'  THEN -t.amount END),0) AS ledger
    FROM wallets w
    LEFT JOIN wallet_transactions t ON t.wallet_id = w.id
    GROUP BY w.id, w.party_type, w.balance
  )
  SELECT jsonb_build_object(
    'key','ledger_drift','label','Wallet balance ≠ ledger sum','severity','critical',
    'count', COUNT(*), 'sample', COALESCE(jsonb_agg(jsonb_build_object('id',id,'party',party_type,'balance',balance,'ledger',ledger)) FILTER (WHERE id IS NOT NULL),'[]'::jsonb)
  ) INTO rec
  FROM (SELECT * FROM drift WHERE ROUND(balance,2) <> ROUND(ledger,2) LIMIT 20) x;
  results := results || jsonb_build_array(rec);

  -- 2. negative balances
  SELECT jsonb_build_object('key','negative_balance','label','Negative wallet balance','severity','critical',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('id',id,'party',party_type,'balance',balance)),'[]'::jsonb))
  INTO rec
  FROM (SELECT id, party_type, balance FROM wallets WHERE balance < 0 LIMIT 20) x;
  results := results || jsonb_build_array(rec);

  -- 3. duplicate settlement credits
  SELECT jsonb_build_object('key','duplicate_credit','label','Wallet credited >1× for same delivery','severity','critical',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('wallet_id',wallet_id,'delivery_id',delivery_id,'n',n)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT wallet_id, delivery_id, COUNT(*) n
    FROM wallet_transactions
    WHERE type='credit' AND delivery_id IS NOT NULL
    GROUP BY wallet_id, delivery_id HAVING COUNT(*)>1 LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 4. settlement approved without wallet tx
  SELECT jsonb_build_object('key','settled_no_tx','label','Settlement approved but no wallet credit recorded','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('delivery_id',id,'ref',order_reference)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT d.id, d.order_reference FROM deliveries d
    WHERE d.settlement_approved = true
      AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.delivery_id = d.id AND t.type='credit')
    LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 5. wallet tx on un-settled delivery
  SELECT jsonb_build_object('key','tx_unsettled','label','Wallet credit linked to delivery without settlement_approved','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('tx_id',tx_id,'delivery_id',delivery_id)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT t.id AS tx_id, t.delivery_id FROM wallet_transactions t
    JOIN deliveries d ON d.id = t.delivery_id
    WHERE t.type='credit' AND d.settlement_approved = false LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 6. completed withdrawal w/o debit
  SELECT jsonb_build_object('key','withdrawal_no_debit','label','Completed withdrawal missing debit transaction','severity','critical',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('withdrawal_id',id,'amount',amount)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT wr.id, wr.amount FROM withdrawal_requests wr
    WHERE wr.status='completed'
      AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.withdrawal_request_id = wr.id AND t.type='debit')
    LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 7. withdrawal amount > current balance (only useful as warning)
  SELECT jsonb_build_object('key','withdrawal_overdraft','label','Withdrawal completed leaving negative wallet','severity','critical',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('withdrawal_id',id,'amount',amount,'wallet_balance',balance)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT wr.id, wr.amount, w.balance FROM withdrawal_requests wr
    JOIN wallets w ON w.id = wr.wallet_id
    WHERE wr.status='completed' AND w.balance < 0 LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 8. revenue sharing != 100
  SELECT jsonb_build_object('key','revshare_bad_sum','label','Revenue sharing percentages do not sum to 100','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('id',id,'sum',total)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT id, ROUND(COALESCE(rider_percentage,0)+COALESCE(merchant_percentage,0)
           +COALESCE(ucs_rides_percentage,0)+COALESCE(platform_percentage,0),2) AS total
    FROM revenue_sharing
  ) s WHERE total <> 100 LIMIT 20;
  results := results || jsonb_build_array(rec);

  -- 9. over-consumed rider expense
  SELECT jsonb_build_object('key','expense_overconsumed','label','Rider expense consumed_amount > amount','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('id',id,'amount',amount,'consumed',consumed_amount)),'[]'::jsonb))
  INTO rec
  FROM (SELECT id, amount, consumed_amount FROM rider_expenses WHERE consumed_amount > amount LIMIT 20) x;
  results := results || jsonb_build_array(rec);

  -- 10. consumption sum mismatch
  SELECT jsonb_build_object('key','consumption_mismatch','label','Sum of consumptions ≠ consumed_amount','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('expense_id',rider_expense_id,'consumed',consumed_amount,'sum',total)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT re.id AS rider_expense_id, re.consumed_amount,
           COALESCE((SELECT SUM(amount_consumed) FROM rider_expense_consumptions c WHERE c.rider_expense_id = re.id),0) AS total
    FROM rider_expenses re
  ) s WHERE ROUND(consumed_amount,2) <> ROUND(total,2) LIMIT 20;
  results := results || jsonb_build_array(rec);

  -- 11. tariff override >50% deviation w/o reason
  SELECT jsonb_build_object('key','tariff_override_large','label','Large tariff override without reason','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('delivery_id',id,'estimated',estimated_tariff,'actual',actual_tariff)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT id, estimated_tariff, actual_tariff FROM deliveries
    WHERE actual_tariff IS NOT NULL AND estimated_tariff IS NOT NULL AND estimated_tariff > 0
      AND ABS(actual_tariff - estimated_tariff) / estimated_tariff > 0.5
      AND (tariff_override_reason IS NULL OR tariff_override_reason = '')
    LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 12. delivered without odometer or distance
  SELECT jsonb_build_object('key','no_distance','label','Delivered without odometer & no distance (no fuel cost)','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('delivery_id',id,'ref',order_reference)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT id, order_reference FROM deliveries
    WHERE status='delivered'
      AND (start_odometer_miles IS NULL OR end_odometer_miles IS NULL)
      AND actual_distance_km IS NULL AND estimated_distance_km IS NULL
    LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 13. orphan wallet transactions
  SELECT jsonb_build_object('key','orphan_tx','label','Orphan wallet transactions (missing wallet)','severity','warning',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('tx_id',id)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT t.id FROM wallet_transactions t
    LEFT JOIN wallets w ON w.id = t.wallet_id
    WHERE w.id IS NULL LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 14. duplicate reconciliation references
  SELECT jsonb_build_object('key','recon_dup_ref','label','Duplicate payment reconciliation references','severity','info',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('reference',payment_reference,'n',n)),'[]'::jsonb))
  INTO rec
  FROM (
    SELECT payment_reference, COUNT(*) n FROM payment_reconciliations
    WHERE payment_reference IS NOT NULL AND payment_reference <> ''
    GROUP BY payment_reference HAVING COUNT(*)>1 LIMIT 20
  ) x;
  results := results || jsonb_build_array(rec);

  -- 15. legacy auto-fuel rows
  SELECT jsonb_build_object('key','legacy_autofuel','label','Legacy auto-fuel expense rows present','severity','info',
    'count',COUNT(*),'sample',COALESCE(jsonb_agg(jsonb_build_object('id',id,'amount',amount)),'[]'::jsonb))
  INTO rec
  FROM (SELECT id, amount FROM rider_expenses WHERE description LIKE 'Auto-fuel for delivery%' LIMIT 20) x;
  results := results || jsonb_build_array(rec);

  RETURN jsonb_build_object('generated_at', now(), 'checks', results, 'acknowledged', ack);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fraud_audit_report() TO authenticated;
