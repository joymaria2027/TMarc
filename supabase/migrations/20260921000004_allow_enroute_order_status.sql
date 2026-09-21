-- Rider Start fails: mirror_delivery_status_to_order() maps delivery picked_up /
-- in_transit onto the linked order 1:1, but orders_status_check predates the
-- mirror and omits both — the AFTER trigger aborts the Start write itself
-- (toast: new row for relation "orders" violates check constraint
-- "orders_status_check"). The order pipeline (timeline ORDER map, merchant
-- ACTIVE_STATUSES, mirror intent) already expects those statuses, so the
-- constraint is widened to a strict superset; nothing previously allowed is
-- removed.
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN
    ('pending_payment','paid','accepted','preparing','ready','dispatched','picked_up','in_transit','delivered','cancelled','refunded'));
