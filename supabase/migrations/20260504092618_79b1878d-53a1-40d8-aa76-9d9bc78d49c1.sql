CREATE POLICY "Restaurant managers can update own deliveries"
ON public.deliveries
FOR UPDATE
USING (
  has_role(auth.uid(), 'restaurant_manager'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.restaurants
    WHERE restaurants.id = deliveries.restaurant_id
      AND restaurants.manager_user_id = auth.uid()
  )
);