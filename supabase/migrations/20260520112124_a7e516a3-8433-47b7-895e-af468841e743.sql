CREATE POLICY "Admins can delete fuel price changes"
ON public.fuel_price_changes
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));