-- Odometer photo uploads use upsert:true (see
-- src/components/OdometerCaptureDialog.tsx), so every upload requires both
-- INSERT and UPDATE privileges on storage.objects. Only INSERT + SELECT were
-- created in 20260520110631, so all uploads failed with
-- "new row violates row-level security policy" (storage POST 400).
--
-- This adds the missing UPDATE (upsert overwrites / retries) and DELETE
-- (rider re-take cleanup) policies, scoped to the rider's own folder:
-- <rider_id>/<delivery_id>/<phase>.<ext>, mirroring the INSERT check.

DROP POLICY IF EXISTS "Riders update own odometer" ON storage.objects;
CREATE POLICY "Riders update own odometer" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'odometer-photos' AND EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1]))
WITH CHECK (bucket_id = 'odometer-photos' AND EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1]));

DROP POLICY IF EXISTS "Riders delete own odometer" ON storage.objects;
CREATE POLICY "Riders delete own odometer" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'odometer-photos' AND EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND id::text = (storage.foldername(name))[1]));
