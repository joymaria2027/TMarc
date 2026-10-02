-- Plan 006: make run_payroll idempotent per (assignment, period).
--
-- run_payroll had no idempotency guard and payroll_runs had no unique
-- constraint, so re-running the same period double-debited the payer and
-- double-credited the payee, and payroll_runs is an append-only log so nothing
-- surfaced the duplicate. The only client protection was an in-flight `running`
-- flag that resets when the dialog closes.
--
-- Two layers, because they fail differently:
--   * The EXISTS check produces a readable, early error before any wallet is
--     touched.
--   * The UNIQUE constraint is the actual control: two admins clicking at the
--     same time can both pass the EXISTS check before either inserts, and only
--   the constraint rejects the second INSERT.
--
-- Verified before applying: no existing payroll_runs rows violate the UNIQUE.
--
-- NOTE: the body below is copied from the 005 money_ledger_integrity migration,
-- not from the original 20260520120446. Copying from the original would revert
-- that plan's ordering fix (ledger INSERT must precede the balance UPDATE) —
-- see the note in 005 before editing.

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_assignment_period_uniq
  UNIQUE (assignment_id, period_start, period_end);

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

  -- Idempotency: bail out before touching a single wallet. 23505 is
  -- unique_violation, which the client's guardedWrite/normalizeWriteError path
  -- already special-cases, so callers can distinguish this from a generic
  -- failure rather than showing an opaque error.
  IF EXISTS (SELECT 1 FROM payroll_runs
              WHERE assignment_id = _assignment_id
                AND period_start = _period_start
                AND period_end = _period_end) THEN
    RAISE EXCEPTION 'Payroll already run for this assignment and period'
      USING ERRCODE = '23505';
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
