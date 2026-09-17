DROP POLICY IF EXISTS product_images_write ON storage.objects;
DROP POLICY IF EXISTS product_images_update ON storage.objects;
DROP POLICY IF EXISTS product_images_delete ON storage.objects;

CREATE POLICY product_images_write
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    EXISTS (
      SELECT 1
      FROM public.merchants m
      WHERE m.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  )
);

CREATE POLICY product_images_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    EXISTS (
      SELECT 1
      FROM public.merchants m
      WHERE m.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'product-images' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    EXISTS (
      SELECT 1
      FROM public.merchants m
      WHERE m.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  )
);

CREATE POLICY product_images_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images' AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    EXISTS (
      SELECT 1
      FROM public.merchants m
      WHERE m.id::text = (storage.foldername(storage.objects.name))[1]
        AND m.manager_user_id = auth.uid()
    )
  )
);