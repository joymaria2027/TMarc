
DROP POLICY IF EXISTS "Riders can view unassigned deliveries" ON public.deliveries;

DROP POLICY IF EXISTS "Riders can upload receipts" ON public.delivery_receipts;
CREATE POLICY "Riders can upload receipts" ON public.delivery_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.riders r ON r.id = d.rider_id
      WHERE d.id = delivery_receipts.delivery_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Riders can view all rejections" ON public.delivery_rejections;

DROP POLICY IF EXISTS "product_images_merchant_write" ON storage.objects;
DROP POLICY IF EXISTS "product_images_merchant_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_merchant_delete" ON storage.objects;

CREATE POLICY "product_images_merchant_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.merchants m ON m.id = p.merchant_id
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_merchant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.merchants m ON m.id = p.merchant_id
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_merchant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.merchants m ON m.id = p.merchant_id
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  );

REVOKE SELECT (withdrawal_pin) ON public.profiles FROM authenticated, anon;

DROP POLICY IF EXISTS "Auth users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;

DROP POLICY IF EXISTS "Users can insert own withdrawal requests" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Restaurant managers can insert withdrawal requests" ON public.withdrawal_requests;

CREATE POLICY "Users can insert own withdrawal requests" ON public.withdrawal_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND EXISTS (
      SELECT 1 FROM public.wallets w
      WHERE w.id = withdrawal_requests.wallet_id
        AND (
          w.user_id = auth.uid()
          OR (w.party_type = 'rider' AND EXISTS (
                SELECT 1 FROM public.riders r WHERE r.id = w.party_id AND r.user_id = auth.uid()))
          OR (w.party_type IN ('merchant','restaurant') AND EXISTS (
                SELECT 1 FROM public.merchants m WHERE m.id = w.party_id AND m.manager_user_id = auth.uid()))
        )
    )
  );

ALTER FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) SET search_path = public;
