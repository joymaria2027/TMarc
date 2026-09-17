CREATE OR REPLACE FUNCTION public.set_withdrawal_pin(_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF length(_pin) < 4 OR length(_pin) > 6 THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;
  IF _pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must contain only digits';
  END IF;

  UPDATE profiles
  SET withdrawal_pin = extensions.crypt(_pin, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE user_id = auth.uid();

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_withdrawal_pin(_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT withdrawal_pin INTO stored_hash
  FROM profiles
  WHERE user_id = auth.uid();

  IF stored_hash IS NULL THEN
    RAISE EXCEPTION 'No withdrawal PIN set. Please set a PIN first.';
  END IF;

  RETURN stored_hash = extensions.crypt(_pin, stored_hash);
END;
$function$;