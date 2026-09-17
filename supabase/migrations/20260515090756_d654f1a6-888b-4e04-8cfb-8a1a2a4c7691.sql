ALTER TABLE public.delivery_rejections REPLICA IDENTITY FULL;
ALTER TABLE public.deliveries REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='delivery_rejections'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_rejections';
  END IF;
END$$;