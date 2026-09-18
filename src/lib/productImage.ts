import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

export function getProductPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function getProductImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const pub = getProductPublicUrl(path);
  if (pub) return pub;

  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expires > now) return hit.url;
  const { data } = await supabase.storage.from("product-images").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: now + 3500_000 });
  return data.signedUrl;
}
