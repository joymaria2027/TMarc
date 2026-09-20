-- Unfreeze legacy deliveries created with customer_name = ''.
-- A blank name trips deliveries_customer_name_not_blank on EVERY update, so
-- these rows are frozen for all writers (rider Accept, cancel-acceptance,
-- ops edits). Merchant-supplied truth: the live queue rows below belong to
-- Joy · 7820582. The remaining blanks are old delivered test rows with no
-- recoverable customer — marked honestly so they stay updatable.
-- Predicate is blank-only: real customer data is never overwritten.
UPDATE public.deliveries
SET customer_name = 'Joy',
    customer_phone = '7820582',
    updated_at = now()
WHERE btrim(customer_name) = ''
  AND status = 'dispatched';

UPDATE public.deliveries
SET customer_name = 'Unknown customer',
    -- Delivered test rows also carry blank phones, which trip the sibling
    -- deliveries_customer_phone_not_blank check on any update. '0000000' is
    -- deliberately non-dialable: a marker, not a real number.
    customer_phone = '0000000',
    updated_at = now()
WHERE btrim(customer_name) = ''
  AND status IN ('delivered', 'cancelled');
