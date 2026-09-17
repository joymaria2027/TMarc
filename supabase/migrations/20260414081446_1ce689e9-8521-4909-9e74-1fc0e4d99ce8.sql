
-- Storage policies for receipts bucket
CREATE POLICY "Riders can upload receipts"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Riders can view own receipts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all receipts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Accountants can view all receipts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts' AND has_role(auth.uid(), 'accountant'::app_role));

CREATE POLICY "Business owners can view all receipts storage"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts' AND has_role(auth.uid(), 'business_owner'::app_role));
