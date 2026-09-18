ALTER TABLE public.delivery_alerts ADD COLUMN IF NOT EXISTS resolved_note TEXT;

COMMENT ON COLUMN public.delivery_alerts.resolved_note IS 'Operator-supplied reason recorded when an alert is resolved (audit trail, especially for money alerts).';
