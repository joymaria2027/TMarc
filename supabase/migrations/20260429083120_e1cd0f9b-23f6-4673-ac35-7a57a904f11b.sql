ALTER TABLE public.delivery_alerts DROP CONSTRAINT IF EXISTS delivery_alerts_alert_type_check;

ALTER TABLE public.delivery_alerts ADD CONSTRAINT delivery_alerts_alert_type_check
CHECK (alert_type = ANY (ARRAY[
  'late_delivery'::text,
  'route_deviation'::text,
  'suspicious'::text,
  'duplicate'::text,
  'out_of_area'::text,
  'delivery_completed'::text,
  'withdrawal_request'::text,
  'withdrawal_completed'::text,
  'withdrawal_rejected'::text
]));