
-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add withdrawal PIN hash column to profiles
ALTER TABLE public.profiles ADD COLUMN withdrawal_pin TEXT DEFAULT NULL;

-- Function to set withdrawal PIN (hashes it before storing)
CREATE OR REPLACE FUNCTION public.set_withdrawal_pin(_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF length(_pin) < 4 OR length(_pin) > 6 THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;
  IF _pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must contain only digits';
  END IF;
  
  UPDATE profiles
  SET withdrawal_pin = crypt(_pin, gen_salt('bf')),
      updated_at = now()
  WHERE user_id = auth.uid();
  
  RETURN TRUE;
END;
$$;

-- Function to verify withdrawal PIN
CREATE OR REPLACE FUNCTION public.verify_withdrawal_pin(_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT withdrawal_pin INTO stored_hash
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF stored_hash IS NULL THEN
    RAISE EXCEPTION 'No withdrawal PIN set. Please set a PIN first.';
  END IF;
  
  RETURN stored_hash = crypt(_pin, stored_hash);
END;
$$;

-- Function to check if user has a PIN set
CREATE OR REPLACE FUNCTION public.has_withdrawal_pin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND withdrawal_pin IS NOT NULL
  );
END;
$$;
