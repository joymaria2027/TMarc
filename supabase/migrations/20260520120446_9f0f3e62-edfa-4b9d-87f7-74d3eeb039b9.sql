
-- 1) Expense types: amortization fields
ALTER TABLE public.expense_types
  ADD COLUMN IF NOT EXISTS amortize_over INT NULL,
  ADD COLUMN IF NOT EXISTS is_maintenance BOOLEAN NOT NULL DEFAULT false;

-- Backfill: maintenance by name => is_maintenance + amortize_over=100; other non-fuel => 50
UPDATE public.expense_types SET is_maintenance = true WHERE name ILIKE '%maintenance%';
UPDATE public.expense_types SET amortize_over = 100 WHERE is_maintenance = true AND amortize_over IS NULL;
UPDATE public.expense_types SET amortize_over = 50 WHERE is_fuel = false AND is_maintenance = false AND amortize_over IS NULL;

-- 2) Rider expenses: consumption tracking
ALTER TABLE public.rider_expenses
  ADD COLUMN IF NOT EXISTS consumed_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fully_consumed_at TIMESTAMPTZ NULL;

-- 3) Consumption ledger
CREATE TABLE IF NOT EXISTS public.rider_expense_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_expense_id UUID NOT NULL REFERENCES public.rider_expenses(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL,
  amount_consumed NUMERIC NOT NULL,
  kind TEXT NOT NULL DEFAULT 'amortized', -- 'fuel' | 'amortized'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rec_expense ON public.rider_expense_consumptions(rider_expense_id);
CREATE INDEX IF NOT EXISTS idx_rec_delivery ON public.rider_expense_consumptions(delivery_id);
ALTER TABLE public.rider_expense_consumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view consumptions" ON public.rider_expense_consumptions
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'app_developer'::app_role) OR has_role(auth.uid(), 'business_owner'::app_role));
CREATE POLICY "Riders view own consumptions" ON public.rider_expense_consumptions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM rider_expenses re JOIN riders r ON r.id = re.rider_id
    WHERE re.id = rider_expense_consumptions.rider_expense_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Managers view merchant consumptions" ON public.rider_expense_consumptions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM rider_expenses re JOIN merchants m ON m.id = re.merchant_id
    WHERE re.id = rider_expense_consumptions.rider_expense_id AND m.manager_user_id = auth.uid()
  ));

-- 4) Replace credit_wallets_on_settlement with prepaid-fuel + amortization
CREATE OR REPLACE FUNCTION public.credit_wallets_on_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  rev RECORD;
  rider_user UUID;
  comp_manager UUID;
  tariff_total NUMERIC;
  fuel_cost NUMERIC := 0;
  prepaid_used NUMERIC := 0;
  amortized_total NUMERIC := 0;
  immediate_total NUMERIC := 0;
  net_income NUMERIC;
  w_id UUID;
  order_ref TEXT;
  bo_user_id UUID;
  ad_user_id UUID;
  fuel_type_row RECORD;
  variant RECORD;
  rate NUMERIC := 0;
  miles NUMERIC := 0;
  remaining_to_consume NUMERIC;
  slice NUMERIC;
  exp_row RECORD;
BEGIN
  IF NEW.settlement_approved = true AND (OLD.settlement_approved IS DISTINCT FROM true) THEN
    SELECT * INTO rev FROM revenue_sharing WHERE delivery_id = NEW.id LIMIT 1;
    IF rev IS NULL THEN
      SELECT * INTO rev FROM revenue_sharing WHERE merchant_id = NEW.merchant_id ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF rev IS NULL THEN RETURN NEW; END IF;

    tariff_total := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
    order_ref := COALESCE(NEW.order_reference, LEFT(NEW.id::text, 8));

    -- Fuel rate
    SELECT * INTO fuel_type_row FROM expense_types WHERE is_fuel = true AND is_active = true LIMIT 1;
    IF fuel_type_row.id IS NOT NULL AND NEW.rider_id IS NOT NULL THEN
      SELECT fv.* INTO variant FROM fuel_variants fv JOIN riders r ON r.fuel_variant_id = fv.id
        WHERE r.id = NEW.rider_id AND fv.is_active = true LIMIT 1;
      IF variant.id IS NULL THEN
        SELECT * INTO variant FROM fuel_variants WHERE expense_type_id = fuel_type_row.id AND is_default = true AND is_active = true LIMIT 1;
      END IF;
      IF variant.id IS NOT NULL THEN
        rate := COALESCE(variant.cost_per_mile, 0);
      ELSE
        rate := COALESCE(fuel_type_row.cost_per_mile, 0);
      END IF;
    END IF;

    -- Miles
    IF NEW.start_odometer_miles IS NOT NULL AND NEW.end_odometer_miles IS NOT NULL AND NEW.end_odometer_miles >= NEW.start_odometer_miles THEN
      miles := NEW.end_odometer_miles - NEW.start_odometer_miles;
    ELSIF NEW.actual_distance_km IS NOT NULL THEN
      miles := NEW.actual_distance_km * 0.621371;
    ELSIF NEW.estimated_distance_km IS NOT NULL THEN
      miles := NEW.estimated_distance_km * 0.621371;
    END IF;

    fuel_cost := ROUND(miles * rate, 2);

    -- FIFO drawdown of approved prepaid fuel rows (rider-wide)
    IF NEW.rider_id IS NOT NULL AND fuel_cost > 0 AND fuel_type_row.id IS NOT NULL THEN
      remaining_to_consume := fuel_cost;
      FOR exp_row IN
        SELECT * FROM rider_expenses
        WHERE rider_id = NEW.rider_id
          AND expense_type_id = fuel_type_row.id
          AND status IN ('approved','verified')
          AND (amount - consumed_amount) > 0
          AND description NOT LIKE 'Auto-fuel for delivery%'
        ORDER BY expense_date ASC, created_at ASC
      LOOP
        EXIT WHEN remaining_to_consume <= 0;
        slice := LEAST(exp_row.amount - exp_row.consumed_amount, remaining_to_consume);
        UPDATE rider_expenses
          SET consumed_amount = consumed_amount + slice,
              fully_consumed_at = CASE WHEN (amount - consumed_amount - slice) <= 0 THEN now() ELSE fully_consumed_at END
          WHERE id = exp_row.id;
        INSERT INTO rider_expense_consumptions (rider_expense_id, delivery_id, amount_consumed, kind)
          VALUES (exp_row.id, NEW.id, slice, 'fuel');
        prepaid_used := prepaid_used + slice;
        remaining_to_consume := remaining_to_consume - slice;
      END LOOP;
    END IF;

    -- Amortized non-fuel expenses (rider+merchant scope)
    IF NEW.rider_id IS NOT NULL THEN
      FOR exp_row IN
        SELECT re.*, et.amortize_over
        FROM rider_expenses re
        JOIN expense_types et ON et.id = re.expense_type_id
        WHERE re.rider_id = NEW.rider_id
          AND (re.merchant_id IS NULL OR re.merchant_id = NEW.merchant_id)
          AND re.status IN ('approved','verified')
          AND (re.amount - re.consumed_amount) > 0
          AND et.is_fuel = false
          AND et.amortize_over IS NOT NULL AND et.amortize_over > 0
      LOOP
        slice := LEAST(ROUND(exp_row.amount / exp_row.amortize_over, 2), exp_row.amount - exp_row.consumed_amount);
        IF slice <= 0 THEN CONTINUE; END IF;
        UPDATE rider_expenses
          SET consumed_amount = consumed_amount + slice,
              fully_consumed_at = CASE WHEN (amount - consumed_amount - slice) <= 0 THEN now() ELSE fully_consumed_at END
          WHERE id = exp_row.id;
        INSERT INTO rider_expense_consumptions (rider_expense_id, delivery_id, amount_consumed, kind)
          VALUES (exp_row.id, NEW.id, slice, 'amortized');
        amortized_total := amortized_total + slice;
      END LOOP;

      -- Immediate non-fuel, non-amortized approved expenses (legacy behavior)
      SELECT COALESCE(SUM(re.amount), 0) INTO immediate_total
      FROM rider_expenses re
      LEFT JOIN expense_types et ON et.id = re.expense_type_id
      WHERE re.rider_id = NEW.rider_id
        AND re.merchant_id = NEW.merchant_id
        AND re.status IN ('approved','verified')
        AND re.deducted_in_delivery_id IS NULL
        AND (et.is_fuel IS NOT TRUE)
        AND (et.amortize_over IS NULL)
        AND re.description NOT LIKE 'Auto-fuel for delivery%';

      IF immediate_total > 0 THEN
        UPDATE rider_expenses
          SET deducted_in_delivery_id = NEW.id
          FROM expense_types et
          WHERE et.id = rider_expenses.expense_type_id
            AND rider_expenses.rider_id = NEW.rider_id
            AND rider_expenses.merchant_id = NEW.merchant_id
            AND rider_expenses.status IN ('approved','verified')
            AND rider_expenses.deducted_in_delivery_id IS NULL
            AND (et.is_fuel IS NOT TRUE)
            AND (et.amortize_over IS NULL);
      END IF;
    END IF;

    net_income := GREATEST(tariff_total - fuel_cost - amortized_total - immediate_total, 0);

    IF NEW.rider_id IS NOT NULL AND rev.rider_percentage > 0 THEN
      SELECT user_id INTO rider_user FROM riders WHERE id = NEW.rider_id;
      SELECT id INTO w_id FROM wallets WHERE party_type = 'rider' AND party_id = NEW.rider_id AND merchant_id = NEW.merchant_id;
      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, merchant_id, balance)
        VALUES ('rider', NEW.rider_id, rider_user, NEW.merchant_id, (net_income * rev.rider_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.rider_percentage / 100), updated_at = now() WHERE id = w_id;
      END IF;
      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.rider_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.rider_percentage || '% of D' || net_income ||
        ' = tariff D' || tariff_total || ' - fuel D' || fuel_cost || ' (prepaid D' || prepaid_used ||
        ') - amortized D' || amortized_total || ' - other D' || immediate_total || ')', NEW.id);
    END IF;

    IF NEW.merchant_id IS NOT NULL AND rev.merchant_percentage > 0 THEN
      SELECT manager_user_id INTO comp_manager FROM merchants WHERE id = NEW.merchant_id;
      SELECT id INTO w_id FROM wallets WHERE party_type = 'merchant' AND party_id = NEW.merchant_id;
      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, merchant_id, balance)
        VALUES ('merchant', NEW.merchant_id, comp_manager, NEW.merchant_id, (net_income * rev.merchant_percentage / 100))
        RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.merchant_percentage / 100), updated_at = now() WHERE id = w_id;
      END IF;
      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.merchant_percentage / 100,
        'Revenue from delivery ' || order_ref || ' (' || rev.merchant_percentage || '% of D' || net_income || ')', NEW.id);
    END IF;

    IF rev.ucs_rides_percentage > 0 THEN
      SELECT ur.user_id INTO bo_user_id FROM user_roles ur WHERE ur.role = 'business_owner' LIMIT 1;
      SELECT id INTO w_id FROM wallets WHERE party_type = 'ucs_rides';
      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, balance)
        VALUES ('ucs_rides', NULL, bo_user_id, (net_income * rev.ucs_rides_percentage / 100)) RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.ucs_rides_percentage / 100), user_id = COALESCE(user_id, bo_user_id), updated_at = now() WHERE id = w_id;
      END IF;
      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.ucs_rides_percentage / 100,
        'UCS Rides revenue ' || order_ref || ' (' || rev.ucs_rides_percentage || '% of D' || net_income || ')', NEW.id);
    END IF;

    IF rev.platform_percentage > 0 THEN
      SELECT ur.user_id INTO ad_user_id FROM user_roles ur WHERE ur.role = 'app_developer' LIMIT 1;
      SELECT id INTO w_id FROM wallets WHERE party_type = 'platform';
      IF w_id IS NULL THEN
        INSERT INTO wallets (party_type, party_id, user_id, balance)
        VALUES ('platform', NULL, ad_user_id, (net_income * rev.platform_percentage / 100)) RETURNING id INTO w_id;
      ELSE
        UPDATE wallets SET balance = balance + (net_income * rev.platform_percentage / 100), user_id = COALESCE(user_id, ad_user_id), updated_at = now() WHERE id = w_id;
      END IF;
      INSERT INTO wallet_transactions (wallet_id, type, amount, description, delivery_id)
      VALUES (w_id, 'credit', net_income * rev.platform_percentage / 100,
        'Platform revenue ' || order_ref || ' (' || rev.platform_percentage || '% of D' || net_income || ')', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) Disable auto-fuel-expense row creation (now handled via prepaid drawdown)
CREATE OR REPLACE FUNCTION public.auto_fuel_expense_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Disabled: per-delivery fuel cost is now computed at settlement via prepaid drawdown.
  RETURN NEW;
END;
$function$;

-- 6) Payroll
DO $$ BEGIN CREATE TYPE public.payroll_payer_type AS ENUM ('merchant','business_owner','platform'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payroll_basis AS ENUM ('fixed','percent_of_wallet_income'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payroll_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_user_id UUID NOT NULL,
  payer_type public.payroll_payer_type NOT NULL,
  payer_merchant_id UUID NULL,
  basis public.payroll_basis NOT NULL,
  fixed_amount NUMERIC NULL,
  percent NUMERIC NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payroll assignments" ON public.payroll_assignments FOR ALL USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Payees view own assignments" ON public.payroll_assignments FOR SELECT USING (payee_user_id = auth.uid());
CREATE POLICY "Merchant managers view their payroll" ON public.payroll_assignments FOR SELECT USING (
  payer_type = 'merchant' AND EXISTS (SELECT 1 FROM merchants m WHERE m.id = payer_merchant_id AND m.manager_user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.payroll_assignments(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  computed_amount NUMERIC NOT NULL,
  payer_wallet_id UUID NULL,
  payee_wallet_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  run_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view payroll runs" ON public.payroll_runs FOR SELECT USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admins insert payroll runs" ON public.payroll_runs FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Payees view own runs" ON public.payroll_runs FOR SELECT USING (
  EXISTS (SELECT 1 FROM payroll_assignments pa WHERE pa.id = assignment_id AND pa.payee_user_id = auth.uid())
);

-- Run payroll function (admin only)
CREATE OR REPLACE FUNCTION public.run_payroll(_assignment_id UUID, _period_start DATE, _period_end DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Debit payer
  IF payer_w IS NOT NULL THEN
    UPDATE wallets SET balance = balance - amt, updated_at = now() WHERE id = payer_w;
    INSERT INTO wallet_transactions (wallet_id, type, amount, description)
    VALUES (payer_w, 'debit', amt, 'Payroll to user ' || a.payee_user_id || ' (' || _period_start || ' - ' || _period_end || ')');
  END IF;

  -- Credit payee
  UPDATE wallets SET balance = balance + amt, updated_at = now() WHERE id = payee_w;
  INSERT INTO wallet_transactions (wallet_id, type, amount, description)
  VALUES (payee_w, 'credit', amt, 'Payroll ' || a.basis || ' (' || _period_start || ' - ' || _period_end || ')');

  INSERT INTO payroll_runs (assignment_id, period_start, period_end, computed_amount, payer_wallet_id, payee_wallet_id, status, run_by)
  VALUES (_assignment_id, _period_start, _period_end, amt, payer_w, payee_w, 'completed', auth.uid())
  RETURNING id INTO run_id;

  RETURN run_id;
END;
$$;
