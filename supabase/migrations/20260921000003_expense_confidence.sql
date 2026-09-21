-- Ticket: .scratch/settlements-dual-mode/02 — expense confidence score.
--
-- Every rider expense is graded 0-100 at submission from static signals
-- (receipt, history norm, duplicates, description). Score >= 85 with amount
-- <= D100 and the rider's auto-verified total today <= D300 is verified by
-- the system; score < 60 forces a human reason in the UI (review_note).
-- Fuel-vs-odometer math is deliberately NOT a signal: it only exists at
-- settlement time, after verification. Anomalies there keep surfacing via
-- the fraud checks and settlement review flags.

-- ---------------------------------------------------------------------------
-- 1. Confidence columns. Existing rows backfill NULL (unscored, fully manual).
-- ---------------------------------------------------------------------------
ALTER TABLE public.rider_expenses
  ADD COLUMN IF NOT EXISTS confidence_score smallint,
  ADD COLUMN IF NOT EXISTS confidence_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_note text;

-- ---------------------------------------------------------------------------
-- 2. Scoring function. Pure computation over the submission + history —
--    callable for rescoring too (_exclude_id skips the row being scored).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_rider_expense(
  _rider_id uuid, _expense_type_id uuid, _amount numeric,
  _receipt_url text, _description text, _exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (v_score integer, v_reasons jsonb)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  s integer := 20;
  r jsonb := '[]'::jsonb;
  v_median numeric;
  v_prior_count integer;
  v_dup boolean;
BEGIN
  -- Receipt: strongest single static signal.
  IF _receipt_url IS NOT NULL AND _receipt_url <> '' THEN
    s := s + 30; r := r || jsonb_build_array('receipt attached +30');
  ELSE
    r := r || jsonb_build_array('no receipt +0');
  END IF;

  -- History norm: this rider, same expense type, median of priors.
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY e.amount)
    INTO v_prior_count, v_median
    FROM public.rider_expenses e
   WHERE e.rider_id = _rider_id
     AND e.expense_type_id IS NOT DISTINCT FROM _expense_type_id
     AND (_exclude_id IS NULL OR e.id IS DISTINCT FROM _exclude_id);
  IF v_prior_count >= 3 AND COALESCE(v_median, 0) > 0 THEN
    IF _amount >= v_median * 0.5 AND _amount <= v_median * 2 THEN
      s := s + 25; r := r || jsonb_build_array('near history norm +25');
    ELSE
      r := r || jsonb_build_array('outside history norm +0');
    END IF;
  ELSE
    s := s + 10; r := r || jsonb_build_array('no history +10');
  END IF;

  -- Near-duplicate: same rider, amount within ±5%, last 7 days.
  SELECT EXISTS (
    SELECT 1 FROM public.rider_expenses e
     WHERE e.rider_id = _rider_id
       AND e.created_at > now() - interval '7 days'
       AND e.amount BETWEEN _amount * 0.95 AND _amount * 1.05
       AND (_exclude_id IS NULL OR e.id IS DISTINCT FROM _exclude_id)
  ) INTO v_dup;
  IF v_dup THEN
    s := s - 20; r := r || jsonb_build_array('possible duplicate -20');
  ELSE
    s := s + 15; r := r || jsonb_build_array('no duplicate +15');
  END IF;

  -- Description present.
  IF _description IS NOT NULL AND length(trim(_description)) >= 4 THEN
    s := s + 10; r := r || jsonb_build_array('description present +10');
  ELSE
    r := r || jsonb_build_array('no description +0');
  END IF;

  v_score := GREATEST(0, LEAST(100, s));
  v_reasons := r;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. BEFORE INSERT trigger: scores every submission and auto-verifies the
--    triple-gated few (score >= 85, amount <= D100, D300 auto-budget left
--    today). BEFORE (not AFTER) so no recursion is possible and the row
--    lands final in one write. Only pending submissions are eligible —
--    human-set statuses pass through scored but untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_and_auto_verify_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_score integer;
  v_reasons jsonb;
  v_today_auto numeric;
BEGIN
  SELECT sc.v_score, sc.v_reasons INTO v_score, v_reasons
    FROM public.score_rider_expense(
      NEW.rider_id, NEW.expense_type_id, NEW.amount,
      NEW.receipt_url, NEW.description, NULL) sc;
  NEW.confidence_score := v_score;
  NEW.confidence_reasons := v_reasons;

  -- Never rewrite a human decision (admin/accountant direct inserts).
  IF NEW.status IS DISTINCT FROM 'pending' THEN RETURN NEW; END IF;

  IF v_score >= 85 AND NEW.amount <= 100 THEN
    SELECT COALESCE(SUM(e.amount), 0) INTO v_today_auto
      FROM public.rider_expenses e
     WHERE e.rider_id = NEW.rider_id
       AND e.auto_verified = true
       AND e.verified_at >= date_trunc('day', now());
    IF v_today_auto + NEW.amount <= 300 THEN
      NEW.status := 'verified';
      NEW.verified_at := now();
      NEW.verified_by := NULL;
      NEW.auto_verified := true;
      -- The app-code rider alert is bypassed on this path, so the DB sends it.
      INSERT INTO public.expense_alerts (rider_id, expense_id, merchant_id, alert_type, message, target_role)
      VALUES (NEW.rider_id, NEW.id, NEW.merchant_id, 'expense_verified',
        'Your expense of D' || NEW.amount::text ||
        ' (' || COALESCE(NULLIF(trim(NEW.description), ''), 'no description') || ')' ||
        ' was auto-verified (confidence ' || v_score::text || '/100).',
        'rider');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_score_expense ON public.rider_expenses;
CREATE TRIGGER trg_score_expense
BEFORE INSERT ON public.rider_expenses
FOR EACH ROW EXECUTE FUNCTION public.score_and_auto_verify_expense();
