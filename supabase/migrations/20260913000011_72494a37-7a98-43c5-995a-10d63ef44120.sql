
-- 1. Wholesaler applications
CREATE TABLE public.wholesalers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL,
  phone text,
  address text,
  approval_status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wholesalers_status_chk CHECK (approval_status IN ('pending','approved','rejected'))
);

GRANT SELECT, INSERT, UPDATE ON public.wholesalers TO authenticated;
GRANT ALL ON public.wholesalers TO service_role;
ALTER TABLE public.wholesalers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wholesalers view own application" ON public.wholesalers
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users can apply as wholesaler" ON public.wholesalers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND approval_status = 'pending' AND approved_by IS NULL AND approved_at IS NULL);
CREATE POLICY "Admins manage wholesaler applications" ON public.wholesalers
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER wholesalers_updated_at BEFORE UPDATE ON public.wholesalers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Grant/revoke the wholesaler role on approval change
CREATE OR REPLACE FUNCTION public.sync_wholesaler_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.approval_status = 'approved' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'wholesaler')
    ON CONFLICT (user_id, role) DO NOTHING;
    IF NEW.approved_at IS NULL THEN NEW.approved_at := now(); END IF;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'wholesaler';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_wholesaler_role() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER wholesalers_sync_role
  BEFORE INSERT OR UPDATE OF approval_status ON public.wholesalers
  FOR EACH ROW EXECUTE FUNCTION public.sync_wholesaler_role();

-- 2. Helper
CREATE OR REPLACE FUNCTION public.is_approved_wholesaler(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wholesalers w
    WHERE w.user_id = _user_id AND w.approval_status = 'approved'
  );
$$;
REVOKE ALL ON FUNCTION public.is_approved_wholesaler(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_wholesaler(uuid) TO authenticated;

-- 3. Per-product wholesale pricing
CREATE TABLE public.product_wholesale_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  wholesale_price numeric,
  min_quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pwp_price_chk CHECK (wholesale_price IS NULL OR wholesale_price >= 0),
  CONSTRAINT pwp_minqty_chk CHECK (min_quantity >= 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_wholesale_pricing TO authenticated;
GRANT ALL ON public.product_wholesale_pricing TO service_role;
ALTER TABLE public.product_wholesale_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved wholesalers view wholesale prices" ON public.product_wholesale_pricing
  FOR SELECT TO authenticated
  USING (
    public.is_approved_wholesaler(auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );
CREATE POLICY "Managers manage wholesale prices" ON public.product_wholesale_pricing
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

CREATE TRIGGER pwp_updated_at BEFORE UPDATE ON public.product_wholesale_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Store-wide wholesale settings
CREATE TABLE public.merchant_wholesale_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL UNIQUE REFERENCES public.merchants(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  discount_percent numeric NOT NULL DEFAULT 0,
  min_quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mws_discount_chk CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT mws_minqty_chk CHECK (min_quantity >= 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_wholesale_settings TO authenticated;
GRANT ALL ON public.merchant_wholesale_settings TO service_role;
ALTER TABLE public.merchant_wholesale_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved wholesalers view store wholesale settings" ON public.merchant_wholesale_settings
  FOR SELECT TO authenticated
  USING (
    public.is_approved_wholesaler(auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
  );
CREATE POLICY "Managers manage store wholesale settings" ON public.merchant_wholesale_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

CREATE TRIGGER mws_updated_at BEFORE UPDATE ON public.merchant_wholesale_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Security fix: scope rider visibility for merchant managers
DROP POLICY IF EXISTS "Restaurant managers can view active riders" ON public.riders;
CREATE POLICY "Managers view their own linked riders" ON public.riders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchant_riders mr
      WHERE mr.rider_id = riders.id
        AND mr.merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
    )
  );
