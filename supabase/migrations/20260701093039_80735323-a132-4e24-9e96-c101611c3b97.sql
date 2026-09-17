
-- 1. Webhook event log
CREATE TABLE public.modempay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  event_id text,
  event_type text,
  order_id uuid,
  payment_reference text,
  signature_header text,
  signature_valid boolean,
  payload_json jsonb,
  processing_status text NOT NULL DEFAULT 'pending',
  processing_error text,
  retry_of_id uuid REFERENCES public.modempay_webhook_events(id) ON DELETE SET NULL,
  raw_body text
);

CREATE UNIQUE INDEX modempay_webhook_events_event_id_key
  ON public.modempay_webhook_events(event_id)
  WHERE event_id IS NOT NULL AND retry_of_id IS NULL;

CREATE INDEX modempay_webhook_events_order_id_idx ON public.modempay_webhook_events(order_id);
CREATE INDEX modempay_webhook_events_received_at_idx ON public.modempay_webhook_events(received_at DESC);

GRANT SELECT ON public.modempay_webhook_events TO authenticated;
GRANT ALL ON public.modempay_webhook_events TO service_role;

ALTER TABLE public.modempay_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read webhook events"
  ON public.modempay_webhook_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'app_developer'::app_role));

-- 2. Order messages
CREATE TABLE public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer','merchant','admin')),
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_messages_order_id_idx ON public.order_messages(order_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.order_messages TO authenticated;
GRANT ALL ON public.order_messages TO service_role;

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- helper: can this user access this order?
CREATE OR REPLACE FUNCTION public.can_access_order(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN merchants m ON m.id = o.merchant_id
    WHERE o.id = _order_id
      AND (c.user_id = _user_id OR m.manager_user_id = _user_id
           OR public.has_role(_user_id,'admin'::app_role))
  );
$$;

CREATE POLICY "Participants can read messages"
  ON public.order_messages FOR SELECT TO authenticated
  USING (public.can_access_order(order_id, auth.uid()));

CREATE POLICY "Participants can send messages"
  ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (sender_user_id = auth.uid()
              AND public.can_access_order(order_id, auth.uid()));

CREATE POLICY "Recipients can mark read"
  ON public.order_messages FOR UPDATE TO authenticated
  USING (public.can_access_order(order_id, auth.uid()))
  WITH CHECK (public.can_access_order(order_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
ALTER TABLE public.order_messages REPLICA IDENTITY FULL;

-- 3. Guard: never downgrade paid -> pending on orders
CREATE OR REPLACE FUNCTION public.guard_order_payment_downgrade()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.payment_status = 'paid' AND NEW.payment_status IN ('pending','failed') THEN
    RAISE EXCEPTION 'Cannot downgrade a paid order to %', NEW.payment_status;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_order_payment_downgrade ON public.orders;
CREATE TRIGGER trg_guard_order_payment_downgrade
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_downgrade();
