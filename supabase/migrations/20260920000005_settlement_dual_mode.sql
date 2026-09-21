-- Ticket: .scratch/settlements-dual-mode — manual + automated settlements coexist.
--
-- Manual approval (SettlementsPage) keeps working exactly as today. Merchants
-- opted into 'auto' get instant settlement when a delivery completes: the
-- delivered transition is already gated on the verified customer handover code
-- (20260920000004), so "instant on delivered" means "instant on
-- code-verified delivery". Wallet crediting stays with the existing
-- credit_wallets_on_settlement trigger; this file only decides *who approves*
-- (human vs system) and nags verifiers while a pending expense blocks automation.
--
-- Per ADR-0002, delivery-level tariff settlement stays decoupled from
-- order-level goods settlement (credit_merchant_for_order) — untouched here.

-- ---------------------------------------------------------------------------
-- 1. Per-merchant settlement mode. Default 'manual' = current behavior.
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS settlement_mode text NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'merchants_settlement_mode_check') THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT merchants_settlement_mode_check
      CHECK (settlement_mode IN ('manual', 'auto'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Auditable settlement source on deliveries. Existing rows (all manually
--    approved) correctly backfill to 'manual' via the column default.
-- ---------------------------------------------------------------------------
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS settlement_source text NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_settlement_source_check') THEN
    ALTER TABLE public.deliveries
      ADD CONSTRAINT deliveries_settlement_source_check
      CHECK (settlement_source IN ('manual', 'auto'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Instant auto-settlement. AFTER UPDATE so the handover-code completion
--    gate (BEFORE trigger) and admin bypass run first — if the delivered
--    transition is rejected, this never fires (same transaction).
--
--    Rider expense back-out rule (mirrors SettlementsPage rider summary):
--    that rider's own verified expenses are netted before the split, so ANY
--    expense in scope that is not yet approved/verified BLOCKS automation and
--    raises a settlement_blocked nag to the verifier instead.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_settle_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_mode text;
  v_tariff numeric;
  v_share_total numeric;
  v_blocker RECORD;
  v_rider_name text;
  v_merchant_name text;
BEGIN
  -- Only the transition into delivered, only while still unapproved.
  -- (The approved check is also the recursion guard for our own UPDATE below.)
  IF NEW.status IS DISTINCT FROM 'delivered' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM 'delivered' THEN RETURN NEW; END IF;
  IF NEW.settlement_approved = true THEN RETURN NEW; END IF;

  SELECT settlement_mode INTO v_mode FROM public.merchants WHERE id = NEW.merchant_id;
  IF v_mode IS DISTINCT FROM 'auto' THEN RETURN NEW; END IF;

  -- Sharing ratio must exist and sum to 100 at fire time (belt-and-braces
  -- alongside guard_revenue_sharing_sum, which enforces this on write).
  SELECT COALESCE(SUM(s.rider_percentage + s.merchant_percentage + s.platform_percentage + s.ucs_rides_percentage), 0)
    INTO v_share_total FROM public.revenue_sharing s WHERE s.merchant_id = NEW.merchant_id;
  IF v_share_total = 0 OR ROUND(v_share_total, 2) <> 100 THEN RETURN NEW; END IF;

  v_tariff := COALESCE(NEW.actual_tariff, NEW.estimated_tariff, 0);
  IF v_tariff <= 0 THEN RETURN NEW; END IF;

  -- Pending-expense block: rider scope (that rider's fuel etc.) + merchant
  -- scope, mirroring the UI netting. Oldest blocker first for a stable message.
  SELECT e.id, e.rider_id, e.merchant_id, e.description, e.amount
    INTO v_blocker
    FROM public.rider_expenses e
   WHERE e.status NOT IN ('approved', 'verified')
     AND ((NEW.rider_id IS NOT NULL AND e.rider_id = NEW.rider_id)
       OR e.merchant_id = NEW.merchant_id)
   ORDER BY e.created_at ASC
   LIMIT 1;

  IF v_blocker.id IS NOT NULL THEN
    -- Immediate nag, throttled to one alert per expense per hour.
    IF NOT EXISTS (SELECT 1 FROM public.expense_alerts a
                    WHERE a.expense_id = v_blocker.id
                      AND a.alert_type = 'settlement_blocked'
                      AND a.created_at > now() - interval '1 hour') THEN
      SELECT p.full_name INTO v_rider_name
        FROM public.riders r LEFT JOIN public.profiles p ON p.user_id = r.user_id
       WHERE r.id = v_blocker.rider_id;
      SELECT name INTO v_merchant_name FROM public.merchants WHERE id = NEW.merchant_id;
      INSERT INTO public.expense_alerts (rider_id, expense_id, merchant_id, alert_type, message, target_role)
      VALUES (v_blocker.rider_id, v_blocker.id, NEW.merchant_id, 'settlement_blocked',
        'Auto-settlement for ' || COALESCE(v_rider_name, 'a rider') ||
        ' is held up by a pending expense of D' || COALESCE(v_blocker.amount, 0)::text ||
        ' (' || COALESCE(v_blocker.description, 'no description') || ') at ' ||
        COALESCE(v_merchant_name, 'the merchant') ||
        ' — verify it to release auto-settlement.',
        'company_manager');
    END IF;
    RETURN NEW;
  END IF;

  -- All clear: system-approves. The existing credit_wallets_on_settlement
  -- trigger fires on this false->true flip and credits the wallets.
  UPDATE public.deliveries
     SET settlement_approved = true,
         settlement_source = 'auto',
         settlement_approved_by = NULL
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_settle_delivery ON public.deliveries;
CREATE TRIGGER trg_auto_settle_delivery
AFTER UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.auto_settle_delivery();

-- ---------------------------------------------------------------------------
-- 4. Retry on late expense verification. The delivered transition already
--    happened while blocked, so when the blocking expense is approved/verified
--    later, pick up the now-unblocked delivery immediately (no hourly wait).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_auto_settlement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  d RECORD;
  v_still_blocked boolean;
BEGIN
  -- Only on the transition into a terminal verified state.
  IF NEW.status IS DISTINCT FROM 'approved' AND NEW.status IS DISTINCT FROM 'verified' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  FOR d IN
    SELECT del.id, del.merchant_id, del.rider_id,
           COALESCE(del.actual_tariff, del.estimated_tariff, 0) AS tariff
      FROM public.deliveries del
      JOIN public.merchants m ON m.id = del.merchant_id
     WHERE del.status = 'delivered'
       AND del.settlement_approved = false
       AND m.settlement_mode = 'auto'
       AND EXISTS (SELECT 1 FROM public.revenue_sharing s WHERE s.merchant_id = del.merchant_id
                    AND ROUND(COALESCE(s.rider_percentage,0) + COALESCE(s.merchant_percentage,0)
                            + COALESCE(s.platform_percentage,0) + COALESCE(s.ucs_rides_percentage,0), 2) = 100)
       AND (del.rider_id = NEW.rider_id OR del.merchant_id = NEW.merchant_id)
  LOOP
    IF d.tariff <= 0 THEN CONTINUE; END IF;
    -- Another pending expense may still block this delivery.
    SELECT EXISTS (
      SELECT 1 FROM public.rider_expenses e
       WHERE e.status NOT IN ('approved', 'verified')
         AND e.id IS DISTINCT FROM NEW.id
         AND ((d.rider_id IS NOT NULL AND e.rider_id = d.rider_id)
           OR e.merchant_id = d.merchant_id)
    ) INTO v_still_blocked;
    IF v_still_blocked THEN CONTINUE; END IF;

    UPDATE public.deliveries
       SET settlement_approved = true,
           settlement_source = 'auto',
           settlement_approved_by = NULL
     WHERE id = d.id;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_retry_auto_settlement ON public.rider_expenses;
CREATE TRIGGER trg_retry_auto_settlement
AFTER UPDATE ON public.rider_expenses
FOR EACH ROW EXECUTE FUNCTION public.retry_auto_settlement();

-- ---------------------------------------------------------------------------
-- 5. Hourly self-healing reminder. Re-alerts (max 1/hour per expense) while a
--    pending expense blocks auto-settlement, and late-approves deliveries that
--    became eligible without a fresh trigger event (e.g. mode flipped to auto
--    after delivery, sharing ratio added late).
--
--    Scheduling (requires the pg_cron extension — run once, NOT in this
--    migration so deploys without pg_cron keep working):
--      SELECT cron.schedule('hourly-settlement-reminders', '0 * * * *',
--        $$SELECT public.remind_blocked_settlements()$$);
--    Alternatively schedule a Supabase Edge Function cron calling this RPC as
--    service_role every hour.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remind_blocked_settlements()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r RECORD;
  v_sent integer := 0;
  v_still_blocked boolean;
  v_rider_name text;
  v_merchant_name text;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (del.id) del.id AS delivery_id, del.merchant_id, del.rider_id,
           COALESCE(del.actual_tariff, del.estimated_tariff, 0) AS tariff,
           e.id AS expense_id, e.rider_id AS expense_rider_id,
           e.description AS expense_description, e.amount AS expense_amount
      FROM public.deliveries del
      JOIN public.merchants m ON m.id = del.merchant_id
      JOIN public.revenue_sharing s ON s.merchant_id = del.merchant_id
      JOIN public.rider_expenses e
        ON e.status NOT IN ('approved', 'verified')
       AND ((del.rider_id IS NOT NULL AND e.rider_id = del.rider_id)
         OR e.merchant_id = del.merchant_id)
     WHERE del.status = 'delivered'
       AND del.settlement_approved = false
       AND m.settlement_mode = 'auto'
       AND NOT EXISTS (SELECT 1 FROM public.expense_alerts a
                        WHERE a.expense_id = e.id
                          AND a.alert_type = 'settlement_blocked'
                          AND a.created_at > now() - interval '1 hour')
     -- Oldest blocker per delivery: at most one nag per delivery per hour.
     ORDER BY del.id, e.created_at ASC
  LOOP
    IF r.tariff <= 0 THEN CONTINUE; END IF;
    SELECT p.full_name INTO v_rider_name
      FROM public.riders dr LEFT JOIN public.profiles p ON p.user_id = dr.user_id
     WHERE dr.id = r.expense_rider_id;
    SELECT name INTO v_merchant_name FROM public.merchants WHERE id = r.merchant_id;
    INSERT INTO public.expense_alerts (rider_id, expense_id, merchant_id, alert_type, message, target_role)
    VALUES (r.expense_rider_id, r.expense_id, r.merchant_id, 'settlement_blocked',
      'Reminder: auto-settlement is still held up by a pending expense of D' ||
      COALESCE(r.expense_amount, 0)::text ||
      ' (' || COALESCE(r.expense_description, 'no description') || ') for ' ||
      COALESCE(v_rider_name, 'a rider') || ' at ' ||
      COALESCE(v_merchant_name, 'the merchant') ||
      ' — verify it to release auto-settlement.',
      'company_manager');
    v_sent := v_sent + 1;
  END LOOP;

  -- Late-approve deliveries with no remaining blockers (mode/sharing fixed after
  -- delivery, or a trigger misfire). Same guards as auto_settle_delivery.
  FOR r IN
    SELECT del.id AS delivery_id, del.merchant_id, del.rider_id,
           COALESCE(del.actual_tariff, del.estimated_tariff, 0) AS tariff
      FROM public.deliveries del
      JOIN public.merchants m ON m.id = del.merchant_id
      JOIN public.revenue_sharing s ON s.merchant_id = del.merchant_id
       AND ROUND(COALESCE(s.rider_percentage,0) + COALESCE(s.merchant_percentage,0)
               + COALESCE(s.platform_percentage,0) + COALESCE(s.ucs_rides_percentage,0), 2) = 100
     WHERE del.status = 'delivered'
       AND del.settlement_approved = false
       AND m.settlement_mode = 'auto'
  LOOP
    IF r.tariff <= 0 THEN CONTINUE; END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.rider_expenses e
       WHERE e.status NOT IN ('approved', 'verified')
         AND ((r.rider_id IS NOT NULL AND e.rider_id = r.rider_id)
           OR e.merchant_id = r.merchant_id)
    ) INTO v_still_blocked;
    IF v_still_blocked THEN CONTINUE; END IF;

    UPDATE public.deliveries
       SET settlement_approved = true,
           settlement_source = 'auto',
           settlement_approved_by = NULL
     WHERE id = r.delivery_id;
  END LOOP;

  RETURN v_sent;
END;
$$;
