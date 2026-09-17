CREATE OR REPLACE FUNCTION public.submit_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  it RECORD;
  mrow RECORD;
  is_restaurant boolean;
BEGIN
  SELECT * INTO o FROM orders WHERE id = _order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status <> 'pending_payment' THEN RETURN false; END IF;

  SELECT mm.*, bt.name AS business_type_name INTO mrow
  FROM merchants mm LEFT JOIN business_types bt ON bt.id = mm.business_type_id
  WHERE mm.id = o.merchant_id;

  is_restaurant := COALESCE(LOWER(mrow.business_type_name) LIKE '%restaurant%'
                         OR LOWER(mrow.business_type_name) LIKE '%food%', false);

  FOR it IN SELECT oi.*, p.track_inventory, p.quantity AS stock_qty, p.available_today
            FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = _order_id
  LOOP
    IF it.product_id IS NULL THEN CONTINUE; END IF;
    IF is_restaurant THEN
      IF NOT COALESCE(it.available_today, true) THEN
        RAISE EXCEPTION 'Product % is not available today', it.name_snapshot;
      END IF;
    ELSIF COALESCE(it.track_inventory, true) THEN
      IF COALESCE(it.stock_qty, 0) < it.quantity THEN
        RAISE EXCEPTION 'Insufficient stock for %', it.name_snapshot;
      END IF;
      UPDATE products SET quantity = quantity - it.quantity WHERE id = it.product_id;
    END IF;
  END LOOP;

  UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = now() WHERE id = _order_id;

  INSERT INTO delivery_alerts (delivery_id, alert_type, message)
  VALUES (NULL, 'new_order',
    'New paid order ' || COALESCE(o.order_reference, LEFT(o.id::text,8)) ||
    ' for D ' || o.total || ' — please accept and prepare.');

  RETURN true;
END;
$function$;