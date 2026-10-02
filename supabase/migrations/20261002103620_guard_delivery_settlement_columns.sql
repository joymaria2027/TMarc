-- Plan 004: block Riders from writing settlement and tariff columns on deliveries.
--
-- The "Riders can update own deliveries" policy (20260412122346) is a blanket
-- FOR UPDATE with no column restriction and no WITH CHECK. Postgres column
-- privileges are the only instrument that can say "this role may write those
-- columns but not these", and a blanket column-level privilege withdrawal would
-- break settlement approval:
-- src/pages/SettlementsPage.tsx approves by issuing a direct client-side
-- .update() from an accountant / company_manager / admin browser session, not by
-- calling a definer function. So the guard is a BEFORE UPDATE trigger that
-- inspects the *writing role*.
--
-- Maintenance — the two ways this guard falls out of date:
--   1. Adding a money column to `deliveries`? Add it to BOTH the
--      `BEFORE UPDATE OF` list and the `IS DISTINCT FROM` chain below.
--   2. Adding a settlement-privileged role? Extend the has_role chain below.
--      It must stay in agreement with the client gate at
--      src/pages/SettlementsPage.tsx (`canApprove`); if the two drift, staff
--      either cannot approve or the button is a lie.

CREATE OR REPLACE FUNCTION public.guard_delivery_settlement_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Only the privileged columns are guarded. Everything a Rider legitimately
  -- writes (status, odometer, receipts, GPS flags) is untouched, and the
  -- `BEFORE UPDATE OF` list below means this body does not even run for those.
  IF NEW.settlement_approved    IS DISTINCT FROM OLD.settlement_approved
     OR NEW.settlement_approved_by IS DISTINCT FROM OLD.settlement_approved_by
     OR NEW.settlement_source    IS DISTINCT FROM OLD.settlement_source
     OR NEW.actual_tariff       IS DISTINCT FROM OLD.actual_tariff
     OR NEW.estimated_tariff    IS DISTINCT FROM OLD.estimated_tariff
  THEN
    -- SECURITY DEFINER callers run as the function owner, not as the Rider whose
    -- UPDATE triggered them. This is the branch that keeps automatic
    -- settlement working: auto_settle_delivery (20260920000005) is declared
    -- SECURITY DEFINER and issues its own UPDATE on the same row, so it must be
    -- allowed through even though the triggering session is a Rider's.
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      IF NOT (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'accountant')
        OR public.has_role(auth.uid(), 'company_manager')
      ) THEN
        RAISE EXCEPTION
          'Only settlement-privileged roles may modify settlement or tariff columns'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_delivery_settlement_columns ON public.deliveries;

CREATE TRIGGER trg_guard_delivery_settlement_columns
  BEFORE UPDATE OF settlement_approved, settlement_approved_by,
                     settlement_source, actual_tariff, estimated_tariff
  ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.guard_delivery_settlement_columns();
