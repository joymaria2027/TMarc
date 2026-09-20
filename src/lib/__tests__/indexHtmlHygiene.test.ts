import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Content-first cold start (transcript lesson: "the first thing I want to do
 * is just load stuff"). index.html must not block first paint on third-party
 * CDN stylesheets. Library CSS belongs in the JS bundle next to the component
 * that needs it (e.g. DeliveryMap imports leaflet.css itself), so pages that
 * never render a map — the landing page and /sell — don't pay for it.
 *
 * Fonts are the deliberate exception: text is content, display=swap is on,
 * and the preconnects are already in place.
 */
describe("index.html render-blocking hygiene", () => {
  const html = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");

  it("loads no library CSS from generic CDNs (unpkg/cdnjs/jsdelivr)", () => {
    const stylesheetHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
      .map(tag => tag[0].match(/href="([^"]+)"/)?.[1] ?? "");
    const offenders = stylesheetHrefs.filter(href =>
      /https:\/\/(unpkg\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//.test(href)
    );
    expect(offenders).toEqual([]);
  });

  it("still preconnects the font hosts and uses display=swap", () => {
    expect(html).toMatch(/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/);
    expect(html).toMatch(/display=swap/);
  });
});
