-- Accept advances a claimed delivery to the 'accepted' stage
-- (RiderDashboard handleAcceptDelivery; QueueCard renders Start Delivery /
-- Mark Completed for it), and the August dispatch functions already map
-- delivery 'accepted' onto order 'dispatched'. But deliveries_status_check
-- (last rewritten 2026-05-20) omits 'accepted', so the write is rejected and
-- the card is stuck in the queue with an "Accept failed" toast.
ALTER TABLE public.deliveries DROP CONSTRAINT deliveries_status_check;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('pending','unassigned','dispatched','accepted','picked_up','in_transit','delivered','cancelled'));
