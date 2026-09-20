import { describe, it, expect, vi, afterEach } from "vitest";

// Ticket: CARTO basemaps now require ?key= on basemaps.cartocdn.com tile URLs.
// DeliveryMap dark mode uses dark_all; without the key it renders an
// "API key required" watermark (browser + CDN tile caching can linger, so
// force-refresh after deploy).
import {
  CARTO_API_KEY_FALLBACK,
  cartoApiKey,
  darkBasemapUrl,
  DARK_BASEMAP_ATTRIBUTION,
} from "@/lib/cartoTiles";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("cartoApiKey", () => {
  it("prefers VITE_CARTO_API_KEY when set", () => {
    vi.stubEnv("VITE_CARTO_API_KEY", "env-key-123");
    expect(cartoApiKey()).toBe("env-key-123");
  });

  it("falls back to the provisioned key when env is missing/blank", () => {
    vi.stubEnv("VITE_CARTO_API_KEY", "");
    expect(cartoApiKey()).toBe(CARTO_API_KEY_FALLBACK);
    expect(CARTO_API_KEY_FALLBACK.length).toBeGreaterThan(0);
  });
});

describe("darkBasemapUrl", () => {
  it("points at CARTO dark_all with a key parameter", () => {
    const url = darkBasemapUrl("TEST_KEY");
    expect(url).toContain("basemaps.cartocdn.com/dark_all");
    expect(url).toContain("?key=TEST_KEY");
  });

  it("defaults to the resolved API key", () => {
    vi.stubEnv("VITE_CARTO_API_KEY", "");
    expect(darkBasemapUrl()).toBe(darkBasemapUrl(CARTO_API_KEY_FALLBACK));
    expect(darkBasemapUrl()).toContain(`?key=${CARTO_API_KEY_FALLBACK}`);
  });
});

describe("DARK_BASEMAP_ATTRIBUTION", () => {
  it("credits OpenStreetMap and CARTO per CARTO terms", () => {
    expect(DARK_BASEMAP_ATTRIBUTION).toContain("openstreetmap.org/copyright");
    expect(DARK_BASEMAP_ATTRIBUTION).toContain("carto.com/attributions");
  });
});
