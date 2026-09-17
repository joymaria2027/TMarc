ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.merchants SET approval_status = 'approved' WHERE approval_status = 'pending';

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

CREATE TABLE IF NOT EXISTS public.merchant_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.merchant_audit_log TO authenticated;
GRANT ALL ON public.merchant_audit_log TO service_role;

ALTER TABLE public.merchant_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view merchant audit log"
  ON public.merchant_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view own merchant audit log"
  ON public.merchant_audit_log FOR SELECT TO authenticated
  USING (merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

CREATE POLICY "Authenticated can insert merchant audit log"
  ON public.merchant_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS merchant_audit_log_merchant_idx ON public.merchant_audit_log(merchant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_merchant_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.can_create_submerchants IS DISTINCT FROM OLD.can_create_submerchants
        OR NEW.parent_merchant_id IS DISTINCT FROM OLD.parent_merchant_id
        OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
        OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at)
       AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can change sub-merchant settings';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.can_create_submerchants AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only admins can grant sub-merchant permission';
    END IF;
    IF NEW.parent_merchant_id IS NOT NULL AND NEW.parent_merchant_id = NEW.id THEN
      RAISE EXCEPTION 'A merchant cannot be its own parent';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_merchant_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_merchant_id IS NOT NULL THEN
      INSERT INTO public.merchant_audit_log(merchant_id, event_type, actor_user_id, detail)
      VALUES (NEW.id, 'submerchant_created', auth.uid(),
              jsonb_build_object('name', NEW.name, 'parent_merchant_id', NEW.parent_merchant_id));
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    INSERT INTO public.merchant_audit_log(merchant_id, event_type, actor_user_id, detail)
    VALUES (NEW.id,
            CASE NEW.approval_status
              WHEN 'approved' THEN 'submerchant_approved'
              WHEN 'rejected' THEN 'submerchant_rejected'
              ELSE 'submerchant_status_changed' END,
            auth.uid(),
            jsonb_build_object('from', OLD.approval_status, 'to', NEW.approval_status, 'reason', NEW.rejection_reason));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS merchants_audit_log ON public.merchants;
CREATE TRIGGER merchants_audit_log
AFTER INSERT OR UPDATE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.log_merchant_audit();

DROP POLICY IF EXISTS "Managers can create sub-merchants" ON public.merchants;
CREATE POLICY "Managers can create sub-merchants"
  ON public.merchants FOR INSERT TO authenticated
  WITH CHECK (
    parent_merchant_id IS NOT NULL
    AND manager_user_id = auth.uid()
    AND can_create_submerchants = false
    AND approval_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.merchants p
      WHERE p.id = merchants.parent_merchant_id
        AND p.manager_user_id = auth.uid()
        AND p.can_create_submerchants = true
    )
  );

REVOKE EXECUTE ON FUNCTION public.log_merchant_audit() FROM PUBLIC, anon;