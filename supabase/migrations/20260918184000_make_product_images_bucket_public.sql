-- Make product-images bucket public so storefront shoppers can load product photos
-- instantly via CDN without signed URL token generation overhead or auth session lock contention.
UPDATE storage.buckets SET public = true WHERE id = 'product-images';
