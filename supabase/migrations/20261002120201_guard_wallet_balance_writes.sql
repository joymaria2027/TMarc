-- Plan 005 step 4: stop a client session from writing wallets.balance directly.
--
-- The hole: "Admins can update wallets" and "Accountants can update wallets" are
-- blanket column UPDATE policies with no WITH CHECK, and "System can insert
-- wallets" lets those same roles INSERT a row with any balance they like. An
-- accountant session can therefore create or destroy money with a single
-- PostgREST call, with no wallet_transactions row. The repo's own
-- fraud_audit_report classes balance-vs-ledger divergence as critical, but only
-- notices it after the fact.
--
-- WHY NOT A LEDGER-PRESENCE PREDICATE (plan 005's original step 4 design)
-- ---------------------------------------------------------------------
-- Plan 005 proposed requiring a matching wallet_transactions row. It was
-- stopped because the predicate is evaluated in a BEFORE trigger while every
-- credit path updates the balance BEFORE inserting its ledger row
-- (credit_wallets_on_settlement at 20260520120446:193/:195, run_payroll at
-- :368/:369). At trigger time the row does not exist yet, so the predicate is a
-- coin flip between halting legitimate settlement credits and missing the hole.
--
-- WHY current_user WORKS INSTEAD
-- -----------------------------
-- Verified against the live database: all four functions that write
-- wallets.balance — credit_wallets_on_settlement, credit_merchant_for_order,
-- process_withdrawal_completion, run_payroll — are SECURITY DEFINER. Inside a
-- SECURITY DEFINER function `current_user` is the function OWNER, not the
-- invoking session role. So:
--
--   * Legitimate write  -> current_user = owner            -> allowed
--   * Attacker's write  -> current_user = authenticated   -> blocked
--
-- This is deliberately an INVERTED (deny) list. Denying only `anon` and
-- `authenticated` — the two roles PostgREST ever uses for an end-user request —
-- closes the actual attack surface while failing OPEN for anything else. That
-- asymmetry matters: a future legitimate writer that turns out not to be a
-- definer keeps working instead of silently halting the business. The failure
-- mode of the alternative allowlist (`current_user IN ('postgres', …)`) is the
-- opposite, and a halted settlement is worse than an open hole.
--
-- The grant surface makes this sufficient: `anon` holds no INSERT/UPDATE on
-- wallets at all, and `authenticated` is the only end-user role with them, so
-- covering these two roles covers every path a client can take.
--
-- Maintenance:
--   * Adding a new client-side wallet write? It must go through a function. Do
--     not add a role to the deny list to accommodate it.
--   * `wallets.party_id` / `user_id` are still client-writable, so a session can
--     point an existing wallet at a different party. That is wallet hijacking,
--     not balance minting, and it is NOT covered here — it needs its own plan.
--   * An INSERT with balance = 0 is allowed (run_payroll creates payee wallets
--     that way); only a non-zero starting balance is money.

CREATE OR REPLACE FUNCTION public.guard_wallet_balance_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(NEW.balance, 0) <> 0 THEN
        RAISE EXCEPTION
          'Wallet balance cannot be created directly; it is set by settlement, withdrawal or payroll'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.balance IS DISTINCT FROM OLD.balance THEN
      RAISE EXCEPTION
        'Wallet balance cannot be changed directly; it moves only via settlement, withdrawal or payroll'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_wallet_balance_writes ON public.wallets;

CREATE TRIGGER trg_guard_wallet_balance_writes
  BEFORE INSERT OR UPDATE OF balance ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.guard_wallet_balance_writes();
