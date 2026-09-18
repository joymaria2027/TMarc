-- Add image_paths array column if not exists to support up to 10 images per product
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_paths text[] DEFAULT '{}';

-- Backfill image_paths from existing image_path
UPDATE products 
SET image_paths = ARRAY[image_path] 
WHERE image_path IS NOT NULL AND (image_paths IS NULL OR cardinality(image_paths) = 0);

-- Sync function to keep image_path as the first element of image_paths
CREATE OR REPLACE FUNCTION sync_product_primary_image()
RETURNS trigger AS $$
BEGIN
  IF NEW.image_paths IS NOT NULL AND cardinality(NEW.image_paths) > 0 THEN
    NEW.image_path := NEW.image_paths[1];
  ELSIF NEW.image_path IS NOT NULL AND (NEW.image_paths IS NULL OR cardinality(NEW.image_paths) = 0) THEN
    NEW.image_paths := ARRAY[NEW.image_path];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_primary_image ON products;
CREATE TRIGGER trg_sync_product_primary_image
BEFORE INSERT OR UPDATE OF image_path, image_paths ON products
FOR EACH ROW EXECUTE FUNCTION sync_product_primary_image();
