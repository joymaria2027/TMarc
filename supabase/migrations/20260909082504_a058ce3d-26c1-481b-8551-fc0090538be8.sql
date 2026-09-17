ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS parent_merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS can_create_submerchants boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_merchants_parent ON public.merchants(parent_merchant_id);

-- Guard: only admins may change parenting / permission columns
CREATE OR REPLACE FUNCTION public.guard_merchant_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.can_create_submerchants IS DISTINCT FROM OLD.can_create_submerchants
        OR NEW.parent_merchant_id IS DISTINCT FROM OLD.parent_merchant_id)
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
$$;

DROP TRIGGER IF EXISTS trg_guard_merchant_hierarchy ON public.merchants;
CREATE TRIGGER trg_guard_merchant_hierarchy
BEFORE INSERT OR UPDATE ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.guard_merchant_hierarchy();

-- Helper: merchants a user manages, plus their direct children
CREATE OR REPLACE FUNCTION public.merchant_ids_for_manager(_user_id uuid)
RETURNS TABLE(merchant_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id FROM public.merchants m WHERE m.manager_user_id = _user_id
  UNION
  SELECT c.id FROM public.merchants c
  JOIN public.merchants p ON p.id = c.parent_merchant_id
  WHERE p.manager_user_id = _user_id
$$;

GRANT EXECUTE ON FUNCTION public.merchant_ids_for_manager(uuid) TO authenticated;

-- Allow permitted managers to create sub-merchants
DROP POLICY IF EXISTS "Managers can create sub-merchants" ON public.merchants;
CREATE POLICY "Managers can create sub-merchants"
ON public.merchants
FOR INSERT
TO authenticated
WITH CHECK (
  parent_merchant_id IS NOT NULL
  AND manager_user_id = auth.uid()
  AND can_create_submerchants = false
  AND EXISTS (
    SELECT 1 FROM public.merchants p
    WHERE p.id = parent_merchant_id
      AND p.manager_user_id = auth.uid()
      AND p.can_create_submerchants = true
  )
);

-- Parent managers can read their branches
DROP POLICY IF EXISTS "Parent managers can view sub-merchants" ON public.merchants;
CREATE POLICY "Parent managers can view sub-merchants"
ON public.merchants
FOR SELECT
TO authenticated
USING (id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

DROP POLICY IF EXISTS "Parent managers can view sub-merchant products" ON public.products;
CREATE POLICY "Parent managers can view sub-merchant products"
ON public.products
FOR SELECT
TO authenticated
USING (merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

DROP POLICY IF EXISTS "Parent managers can view sub-merchant orders" ON public.orders;
CREATE POLICY "Parent managers can view sub-merchant orders"
ON public.orders
FOR SELECT
TO authenticated
USING (merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));

DROP POLICY IF EXISTS "Parent managers can view sub-merchant order items" ON public.order_items;
CREATE POLICY "Parent managers can view sub-merchant order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  WHERE o.id = order_items.order_id
    AND o.merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid()))
));

DROP POLICY IF EXISTS "Parent managers can view sub-merchant tariffs" ON public.merchant_tariffs;
CREATE POLICY "Parent managers can view sub-merchant tariffs"
ON public.merchant_tariffs
FOR SELECT
TO authenticated
USING (merchant_id IN (SELECT merchant_id FROM public.merchant_ids_for_manager(auth.uid())));