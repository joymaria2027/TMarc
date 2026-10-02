-- Plan 005: close the money-ledger integrity gaps.
--
-- Three fixes land here:
--   1. Debit ordering in process_withdrawal_completion and run_payroll.
--   2. CHECK (amount > 0) on withdrawal_requests.
--   4. orders.total validation in submit_order.
--
-- Step 4 of the plan (a BEFORE UPDATE OF balance trigger on public.wallets that
-- requires a matching wallet_transactions row) is NOT in this file. Its
-- proposed predicate compares the candidate ledger row's timestamp against the
-- wallet's previous updated_at, and it is evaluated in a BEFORE trigger — but
-- every credit path inserts its ledger row *after* the balance update
-- (credit_wallets_on_settlement: UPDATE at 20260520120446:193, INSERT at :195;
-- same shape in run_payroll at :368/:369). At trigger time that row does not
-- exist yet, so the predicate is a coin flip between false-positives (which
-- would halt legitimate settlement credits) and false-negatives (which would
-- leave the hole open). That is the plan's own STOP condition.
-- `wallets.balance` therefore remains directly writable by an accountant/admin
-- session. That hole is still open and needs its own plan.
--
-- Maintenance — the ordering fix below is load-bearing. `guard_wallet_debit` is a
-- BEFORE INSERT on wallet_transactions that reads wallets.balance. If a future
-- edit moves the INSERT back below the UPDATE, the check silently degrades to
-- `balance < 2 * amount` and every withdrawal over half the balance starts
-- failing again. Keep the ledger row first.

-- ---------------------------------------------------------------------------
-- Fix 1a: process_withdrawal_completion — ledger row before the balance debit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_withdrawal_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w RECORD;
  party_name TEXT;
BEGIN
  IF NEW.status = 'manager_approved' AND OLD.status IS DISTINCT FROM 'manager_approved' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'merchant' THEN
      SELECT name INTO party_name FROM merchants WHERE id = w.party_id;
    ELSE
      party_name := 'Platform';
    END IF;

    INSERT INTO delivery_alerts (delivery_id, alert_type, message)
    VALUES (NULL, 'withdrawal_request',
      'Withdrawal of D ' || NEW.amount || ' for ' || COALESCE(party_name, 'unknown') ||
      ' approved by merchant manager. Awaiting accountant final approval.');
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    -- Insert the ledger row FIRST so guard_wallet_debit (BEFORE INSERT) reads
    -- the pre-debit balance. Debiting first reduces its check to
    -- `balance_after < amount`, i.e. `original_balance < 2 * amount`, which
    -- rejects every withdrawal over half the balance — including "Withdraw All".
    INSERT INTO wallet_transactions (wallet_id, type, amount, description, withdrawal_request_id)
    VALUES (NEW.wallet_id, 'debit', NEW.amount,
      'Withdrawal via ' || COALESCE(NEW.payout_method, 'N/A'), NEW.id);

    UPDATE wallets SET balance = balance - NEW.amount, updated_at = now()
    WHERE id = NEW.wallet_id;

    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;

    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'merchant' THEN
      SELECT name INTO party_name FROM merchants WHERE id = w.party_id;
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

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    SELECT * INTO w FROM wallets WHERE id = NEW.wallet_id;
    IF w.party_type = 'rider' THEN
      SELECT p.full_name INTO party_name FROM riders r JOIN profiles p ON p.user_id = r.user_id WHERE r.id = w.party_id;
    ELSIF w.party_type = 'merchant' THEN
      SELECT name INTO party_name FROM merchants WHERE id = w.party_id;
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

-- ---------------------------------------------------------------------------
-- Fix 1b: run_payroll — same ordering fix on the payer debit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_payroll(_assignment_id uuid, _period_start date, _period_end date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  a RECORD;
  amt NUMERIC := 0;
  income NUMERIC := 0;
  payer_w UUID;
  payee_w UUID;
  run_id UUID;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admin can run payroll';
  END IF;

  SELECT * INTO a FROM payroll_assignments WHERE id = _assignment_id;
  IF a IS NULL THEN RAISE EXCEPTION 'Assignment not found'; END IF;

  -- Resolve payer wallet
  IF a.payer_type = 'merchant' THEN
    SELECT id INTO payer_w FROM wallets WHERE party_type = 'merchant' AND party_id = a.payer_merchant_id LIMIT 1;
  ELSIF a.payer_type = 'business_owner' THEN
    SELECT id INTO payer_w FROM wallets WHERE party_type = 'ucs_rides' LIMIT 1;
  ELSE
    SELECT id INTO payer_w FROM wallets WHERE party_type = 'platform' LIMIT 1;
  END IF;

  -- Compute amount
  IF a.basis = 'fixed' THEN
    amt := COALESCE(a.fixed_amount, 0);
  ELSE
    IF payer_w IS NOT NULL THEN
      SELECT COALESCE(SUM(amount),0) INTO income
      FROM wallet_transactions
      WHERE wallet_id = payer_w
        AND type = 'credit'
        AND created_at::date BETWEEN _period_start AND _period_end;
      amt := ROUND(income * COALESCE(a.percent,0) / 100, 2);
    END IF;
  END IF;

  IF amt <= 0 THEN RAISE EXCEPTION 'Computed amount is zero'; END IF;

  -- Resolve / create payee wallet
  SELECT id INTO payee_w FROM wallets WHERE party_type = 'payroll' AND user_id = a.payee_user_id LIMIT 1;
  IF payee_w IS NULL THEN
    INSERT INTO wallets (party_type, party_id, user_id, balance)
    VALUES ('payroll', NULL, a.payee_user_id, 0) RETURNING id INTO payee_w;
  END IF;

  -- Debit payer (ledger row first — see the note at the top of this file)
  IF payer_w IS NOT NULL THEN
    INSERT INTO wallet_transactions (wallet_id, type, amount, description)
    VALUES (payer_w, 'debit', amt, 'Payroll to user ' || a.payee_user_id || ' (' || _period_start || ' - ' || _period_end || ')');

    UPDATE wallets SET balance = balance - amt, updated_at = now() WHERE id = payer_w;
  END IF;

  -- Credit payee
  INSERT INTO wallet_transactions (wallet_id, type, amount, description)
  VALUES (payee_w, 'credit', amt, 'Payroll ' || a.basis || ' (' || _period_start || ' - ' || _period_end || ')');

  UPDATE wallets SET balance = balance + amt, updated_at = now() WHERE id = payee_w;

  INSERT INTO payroll_runs (assignment_id, period_start, period_end, computed_amount, payer_wallet_id, payee_wallet_id, status, run_by)
  VALUES (_assignment_id, _period_start, _period_end, amt, payer_w, payee_w, 'completed', auth.uid())
  RETURNING id INTO run_id;

  RETURN run_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fix 2: a withdrawal amount must be positive.
--
-- The insert policy checks requested_by and wallet ownership but not amount, and
-- the completion trigger does `balance - NEW.amount`. A negative amount therefore
-- turns a withdrawal into a wallet mint. The platform's own
-- withdrawal_overdraft fraud check only fires on balance < 0, so the mint is
-- invisible to it. Verified before applying: no existing row violates this.
-- ---------------------------------------------------------------------------
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_amount_positive CHECK (amount > 0);

-- ---------------------------------------------------------------------------
-- Fix 4: orders.total must equal subtotal + delivery_fee.
--
-- orders_merchant_update is an unrestricted column UPDATE for merchant managers,
-- and credit_merchant_for_order credits ROUND(o.subtotal, 2), so a rewritten
-- `total` does not reduce what the merchant is paid — it only reduces what the
-- customer is verified as having paid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o RECORD;
  it RECORD;
  mrow RECORD;
  is_restaurant boolean;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending_payment' THEN RETURN false; END IF;

  -- Payment must have been confirmed by the payment webhook (service-role writer).
  IF NOT EXISTS (
    SELECT 1 FROM public.order_payment_verifications v
    WHERE v.order_id = _order_id
      AND v.amount_covers_order = true
  ) THEN
    RAISE EXCEPTION 'Payment for this order has not been confirmed';
  END IF;

  SELECT mm.*, bt.name AS business_type_name INTO mrow
  FROM merchants mm LEFT JOIN business_types bt ON bt.id = mm.business_type_id
  WHERE mm.id = o.merchant_id;

  IF mrow IS NULL OR mrow.approval_status <> 'approved' OR mrow.is_active = false THEN
    RAISE EXCEPTION 'Merchant is not approved or inactive';
  END IF;

  is_restaurant := COALESCE(LOWER(mrow.business_type_name) LIKE '%restaurant%'
                         OR LOWER(mrow.business_type_name) LIKE '%food%', false);

  FOR it IN SELECT oi.*, p.track_inventory, p.quantity AS stock_qty, p.available_today,
                   p.price AS current_price, p.is_active AS product_is_active
            FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = _order_id
  LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;

    -- Client-authored snapshots are untrusted: line math must be internally
    -- consistent and each price must still match the merchant's catalog price.
    IF ABS(it.line_total - (it.price_snapshot * it.quantity)) > 0.009 THEN
      RAISE EXCEPTION 'Order price data is stale or tampered';
    END IF;
    IF it.product_is_active IS NOT NULL AND NOT it.product_is_active THEN
      RAISE EXCEPTION 'Product % is no longer available', it.name_snapshot;
    END IF;
    IF ABS(COALESCE(it.current_price, it.price_snapshot) - it.price_snapshot) > 0.009 THEN
      RAISE EXCEPTION 'Order price data is stale or tampered';
    END IF;

    IF is_restaurant THEN
      IF NOT COALESCE(it.available_today, true) THEN
        RAISE EXCEPTION 'Product % is not available today', it.name_snapshot;
      END IF;
    ELSIF COALESCE(it.track_inventory, true) THEN
      IF COALESCE(it.stock_qty, 0) < it.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for %', it.name_snapshot;
      END IF;
      UPDATE products SET quantity = quantity - it.quantity WHERE id = it.product_id;
    END IF;
  END LOOP;

  -- The goods subtotal must equal the sum of line totals. (This comment
  -- previously claimed to catch a rewritten order.total; it never did — the
  -- check below that does is separate.)
  IF ABS(COALESCE(o.subtotal, 0) - (
       SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = _order_id
     )) > 0.009 THEN
    RAISE EXCEPTION 'Order price data is stale or tampered';
  END IF;

  -- The payable total must equal subtotal + delivery_fee. Without this a
  -- merchant manager can rewrite `total` to a token amount: the customer is
  -- verified against the tampered figure while credit_merchant_for_order still
  -- credits the untampered subtotal.
  IF ABS(COALESCE(o.total, 0)
       - (COALESCE(o.subtotal, 0) + COALESCE(o.delivery_fee, 0))) > 0.009 THEN
    RAISE EXCEPTION 'Order total does not match subtotal plus delivery fee';
  END IF;

  UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = now() WHERE id = _order_id;

  PERFORM public.credit_merchant_for_order(_order_id, 'live');

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL, 'new_order',
    'New paid order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) ||
    ' for D ' || o.total || ' — please accept and prepare.');

  PERFORM public.log_dispatch_event(_order_id, NULL, NULL, 'order_paid',
    jsonb_build_object('subtotal', o.subtotal, 'total', o.total, 'merchant_id', o.merchant_id));

  RETURN true;
END;
$$;
