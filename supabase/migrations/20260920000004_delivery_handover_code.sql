-- Ticket: .scratch/handover-code/ — customer handover code (2026-09-20).
-- Anti-abuse: completing a Delivery must be confirmed by the Customer. A
-- 6-digit code is generated server-side per delivery; the Rider must have it
-- verified by RPC before ANY transition to delivered (End Delivery AND Mark
-- Completed paths). Ops bypass is preserved for legitimate corrections.
--
-- The code lives in its own table with RLS enabled and NO policies: riders
-- (and everyone else) can only reach it through the SECURITY DEFINER RPCs, so
-- a rider reading their queue with select('*') — or any direct API call — can
-- never see the code. Attempt lockout blocks brute force; the code row is
-- deleted on delivery so one confirmation can never be replayed.
--
-- Known gap (pre-existing, matches the superseded receipt/pickup gate): the
-- completion trigger fires on UPDATE only, so an INSERT with status='delivered'
-- (as used by the settlement-e2e harness under service_role) bypasses it.
-- Closing it requires a service_role carve-out in the trigger — follow-up.

-- ---------------------------------------------------------------------------
-- 1. Storage — isolated, RLS-denied
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_handover_codes (
  delivery_id uuid PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE,
  handover_code integer NOT NULL CHECK (handover_code BETWEEN 100000 AND 999999),
  handover_code_verified_at timestamptz,
  handover_code_attempts integer NOT NULL DEFAULT 0,
  handover_code_last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_handover_codes ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: every access goes through the RPCs below.

-- ---------------------------------------------------------------------------
-- 2. Server-side generation on delivery INSERT (never in the browser)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_handover_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.delivery_handover_codes (delivery_id, handover_code)
  VALUES (NEW.id, 100000 + floor(random() * 900000)::int)
  ON CONFLICT (delivery_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_handover_code ON public.deliveries;
CREATE TRIGGER trg_assign_handover_code
AFTER INSERT ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.assign_handover_code();

-- ---------------------------------------------------------------------------
-- 3. Rider verification — the only way handover_code_verified_at gets set
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_delivery_handover_code(_delivery_id uuid, _code integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_code integer;
  v_attempts integer;
  v_last_attempt timestamptz;
  v_rider_id uuid;
BEGIN
  -- Only riders reach this RPC, and only for their own delivery.
  SELECT r.id INTO v_rider_id FROM public.riders r WHERE r.user_id = auth.uid();
  IF v_rider_id IS NULL THEN
    RAISE EXCEPTION 'Only riders can verify handover codes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.deliveries WHERE id = _delivery_id AND rider_id IS NOT DISTINCT FROM v_rider_id) THEN
    RAISE EXCEPTION 'Delivery is not assigned to you';
  END IF;

  SELECT handover_code, handover_code_attempts, handover_code_last_attempt_at
    INTO v_code, v_attempts, v_last_attempt
  FROM public.delivery_handover_codes WHERE delivery_id = _delivery_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Delivery is no longer awaiting handover confirmation';
  END IF;

  -- Brute-force lockout: a rolling 5-failures-per-10-minute window. The counter
  -- resets only when the whole window has passed, so bursts stay capped.
  IF v_last_attempt IS NOT NULL AND v_last_attempt <= now() - interval '10 minutes' THEN
    v_attempts := 0;
  END IF;
  IF v_attempts >= 5 THEN
    UPDATE public.delivery_handover_codes
       SET handover_code_last_attempt_at = now()
     WHERE delivery_id = _delivery_id;
    RAISE EXCEPTION 'Too many attempts — wait 10 minutes';
  END IF;

  IF v_code IS DISTINCT FROM _code THEN
    UPDATE public.delivery_handover_codes
       SET handover_code_attempts = handover_code_attempts + 1,
           handover_code_last_attempt_at = now()
     WHERE delivery_id = _delivery_id;
    RETURN false;
  END IF;

  UPDATE public.delivery_handover_codes
     SET handover_code_verified_at = now(),
         handover_code_attempts = 0,
         handover_code_last_attempt_at = NULL
   WHERE delivery_id = _delivery_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_delivery_handover_code(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Customer / staff code reveal — never exposed to riders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_handover_code(_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_code integer;
BEGIN
  -- Customer linkage: order -> customer -> the calling user.
  SELECT c.code INTO v_code
  FROM public.delivery_handover_codes c
  JOIN public.deliveries d ON d.id = c.delivery_id
  JOIN public.orders o ON o.delivery_id = d.id
  JOIN public.customers cu ON cu.id = o.customer_id
  WHERE c.delivery_id = _delivery_id
    AND cu.user_id = auth.uid();

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Ops relays the code for merchant-created (manual) deliveries: those are
  -- created by merchants/managers who hold the customer relationship.
  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'app_developer'::app_role)
     OR has_role(auth.uid(), 'business_owner'::app_role)
     OR has_role(auth.uid(), 'merchant_manager'::app_role) THEN
    SELECT handover_code INTO v_code
    FROM public.delivery_handover_codes WHERE delivery_id = _delivery_id;
    RETURN v_code;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_handover_code(uuid) TO authenticated;

-- PostgREST computed column: lets customer-facing selects read
-- `deliveries.handover_code` (e.g. orders embedded as
-- `deliveries!orders_delivery_id_fkey(status, handover_code)` in MyOrders)
-- without exposing the code column on the table. Resolves per-caller: the
-- customer who owns the order gets their code; everyone else (riders included)
-- gets NULL by construction. Staff relay continues via get_my_handover_code.
CREATE OR REPLACE FUNCTION public.handover_code(d public.deliveries)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_code integer;
BEGIN
  SELECT c.handover_code INTO v_code
  FROM public.delivery_handover_codes c
  JOIN public.orders o ON o.delivery_id = d.id
  JOIN public.customers cu ON cu.id = o.customer_id
  WHERE c.delivery_id = d.id
    AND cu.user_id = auth.uid();
  RETURN v_code;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Completion gate — hardens require_delivery_completion_proof: every
--    non-admin transition into delivered now requires a VERIFIED handover code
--    (the picked_up/receipt clauses are superseded by this stronger proof).
--    Expiry folds in here: on delivered the code row is deleted, so the same
--    confirmation can never be replayed onto a later attempt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_delivery_completion_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    IF has_role(auth.uid(), 'admin'::app_role)
       OR has_role(auth.uid(), 'app_developer'::app_role) THEN
      DELETE FROM public.delivery_handover_codes WHERE delivery_id = NEW.id;
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.delivery_handover_codes
      WHERE delivery_id = NEW.id AND handover_code_verified_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Delivery cannot be completed without the customer handover code (delivery %)', NEW.id;
    END IF;
    DELETE FROM public.delivery_handover_codes WHERE delivery_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_delivery_proof ON public.deliveries;
CREATE TRIGGER trg_require_delivery_proof
BEFORE UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION public.require_delivery_completion_proof();

-- ---------------------------------------------------------------------------
-- 6. Backfill: deliveries already on the road need codes so the new gate does
--    not freeze live runs. (Already-delivered rows are deliberately skipped.)
-- ---------------------------------------------------------------------------
INSERT INTO public.delivery_handover_codes (delivery_id, handover_code)
SELECT id, 100000 + floor(random() * 900000)::int
FROM public.deliveries
WHERE status IN ('dispatched', 'accepted', 'picked_up', 'in_transit')
ON CONFLICT (delivery_id) DO NOTHING;
