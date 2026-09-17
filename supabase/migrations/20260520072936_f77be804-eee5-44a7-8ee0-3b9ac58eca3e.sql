ALTER TABLE public.deliveries DROP CONSTRAINT deliveries_status_check;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending','unassigned','dispatched','picked_up','in_transit','delivered','cancelled'));