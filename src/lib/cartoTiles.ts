// CARTO basemap tile helpers (shared by DeliveryMap and its tests).
//
// CARTO basemaps now require an API key (?key=) on basemaps.cartocdn.com,
// otherwise tiles render an "API key required" watermark. The key is a public
// publishable key (visible in tile URLs by design, restricted by HTTP referrer
// in the CARTO dashboard). Prefer VITE_CARTO_API_KEY so it can rotate via
// deploy env without a code change; fall back to the provisioned key so tiles
// keep working when the env is missing.
export const CARTO_API_KEY_FALLBACK = "cb1_3rne_1_209576bac8d793f6811ef2ab";

export function cartoApiKey(): string {
  const envKey = (import.meta.env?.VITE_CARTO_API_KEY as string | undefined)?.trim();
  return envKey ? envKey : CARTO_API_KEY_FALLBACK;
}

export function darkBasemapUrl(key: string = cartoApiKey()): string {
  return `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${key}`;
}

export const DARK_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
