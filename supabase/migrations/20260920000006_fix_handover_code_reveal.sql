-- Ticket: .scratch/handover-code/01 — runtime bugfixes (2026-09-20).
-- 20260920000004 shipped get_my_handover_code with `SELECT c.code`, but the
-- delivery_handover_codes column is handover_code. Postgres does not resolve
-- plpgsql column references until first execution, so the migration applied
-- cleanly and the bug only surfaced on the first live call (HTTP 400,
-- SQLSTATE 42703). Post-push verification against the remote REST endpoint
-- then exposed a second latent error in the same function: the ops branch
-- tested has_role(..., 'merchant_manager'), which is not a value of the
-- app_role enum (SQLSTATE 22P02) — the platform's merchant-facing manager
-- role is `company_manager`. Both are corrected here; this file supersedes
-- the function body from 04 and is the single source of truth for it.

CREATE OR REPLACE FUNCTION public.get_my_handover_code(_delivery_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_code integer;
BEGIN
  -- Customer linkage: deliveries <- orders <- customers.user_id = auth.uid()
  SELECT c.handover_code INTO v_code
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
     OR has_role(auth.uid(), 'company_manager'::app_role) THEN
    SELECT handover_code INTO v_code
    FROM public.delivery_handover_codes WHERE delivery_id = _delivery_id;
    RETURN v_code;
  END IF;

  RETURN NULL;
END;
$$;
