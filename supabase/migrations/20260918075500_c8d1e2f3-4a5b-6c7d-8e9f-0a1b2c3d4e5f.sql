-- Wholesale in-app notifications, rider-store assignment restrictions, and permissions restrictions

-- 1. In-App Notifications table for users (wholesalers, customers, etc.)
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'wholesale_status',
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own notifications" ON public.user_notifications;
CREATE POLICY "Users view own notifications" ON public.user_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications" ON public.user_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all notifications" ON public.user_notifications;
CREATE POLICY "Admins manage all notifications" ON public.user_notifications
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for user_notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;

-- Trigger to notify wholesaler on application decision (approved or declined with reason)
CREATE OR REPLACE FUNCTION public.notify_wholesaler_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notif_title text;
  notif_msg text;
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status = 'approved' THEN
      notif_title := 'Wholesale application approved';
      notif_msg := 'Congratulations! Your wholesale account for ' || NEW.business_name || ' has been approved. Wholesale prices are now active across the shop.';
      INSERT INTO public.user_notifications (user_id, title, message, type, metadata)
      VALUES (NEW.user_id, notif_title, notif_msg, 'wholesale_approved', jsonb_build_object('wholesaler_id', NEW.id, 'status', 'approved'));
    ELSIF NEW.approval_status = 'rejected' THEN
      notif_title := 'Wholesale application declined';
      notif_msg := 'Your wholesale application for ' || NEW.business_name || ' was declined.' ||
        CASE WHEN NEW.rejection_reason IS NOT NULL AND TRIM(NEW.rejection_reason) <> ''
             THEN ' Reason: ' || TRIM(NEW.rejection_reason)
             ELSE ''
        END;
      INSERT INTO public.user_notifications (user_id, title, message, type, metadata)
      VALUES (NEW.user_id, notif_title, notif_msg, 'wholesale_rejected', jsonb_build_object('wholesaler_id', NEW.id, 'status', 'rejected', 'rejection_reason', NEW.rejection_reason));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_wholesaler_on_review ON public.wholesalers;
CREATE TRIGGER trg_notify_wholesaler_on_review
  AFTER UPDATE OF approval_status, rejection_reason ON public.wholesalers
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_wholesaler_on_review();


-- 2. Restrict rider-store assignments (public.merchant_riders)
DROP POLICY IF EXISTS "Authenticated can view restaurant riders" ON public.merchant_riders;
DROP POLICY IF EXISTS "Admins can manage restaurant riders" ON public.merchant_riders;
DROP POLICY IF EXISTS "merchant_riders_admin_all" ON public.merchant_riders;
DROP POLICY IF EXISTS "merchant_riders_manager_select" ON public.merchant_riders;
DROP POLICY IF EXISTS "merchant_riders_manager_insert" ON public.merchant_riders;
DROP POLICY IF EXISTS "merchant_riders_manager_delete" ON public.merchant_riders;
DROP POLICY IF EXISTS "merchant_riders_rider_select" ON public.merchant_riders;

-- Admins can manage all merchant_riders
CREATE POLICY "merchant_riders_admin_all" ON public.merchant_riders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Store managers (and accountants) can view assignments for their own or sub-merchants
CREATE POLICY "merchant_riders_manager_select" ON public.merchant_riders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_riders.merchant_id
        AND (m.manager_user_id = auth.uid() OR m.accountant_user_id = auth.uid())
    )
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );

-- Store managers can assign riders to their own or sub-merchants
CREATE POLICY "merchant_riders_manager_insert" ON public.merchant_riders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_riders.merchant_id
        AND m.manager_user_id = auth.uid()
    )
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );

-- Store managers can remove rider assignments for their own or sub-merchants
CREATE POLICY "merchant_riders_manager_delete" ON public.merchant_riders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_riders.merchant_id
        AND m.manager_user_id = auth.uid()
    )
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );

-- Riders can view their own assignments
CREATE POLICY "merchant_riders_rider_select" ON public.merchant_riders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.riders r
      WHERE r.id = merchant_riders.rider_id
        AND r.user_id = auth.uid()
    )
  );


-- 3. Restrict internal permissions list (role_permissions, custom_roles, custom_resources)
DROP POLICY IF EXISTS "Anyone authenticated can view permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_authorized_select" ON public.role_permissions;
CREATE POLICY "role_permissions_authorized_select" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'app_developer'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view custom roles" ON public.custom_roles;
DROP POLICY IF EXISTS "custom_roles_authorized_select" ON public.custom_roles;
CREATE POLICY "custom_roles_authorized_select" ON public.custom_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'app_developer'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view custom resources" ON public.custom_resources;
DROP POLICY IF EXISTS "custom_resources_authorized_select" ON public.custom_resources;
CREATE POLICY "custom_resources_authorized_select" ON public.custom_resources
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'app_developer'::app_role)
  );
