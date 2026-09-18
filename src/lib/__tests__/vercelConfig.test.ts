import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("vercel.json deployment configuration", () => {
  const vercelConfigPath = path.resolve(__dirname, "../../../vercel.json");

  it("exists and is valid JSON", () => {
    expect(fs.existsSync(vercelConfigPath), "vercel.json should exist at project root").toBe(true);
    const content = fs.readFileSync(vercelConfigPath, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("contains SPA catch-all rewrite to /index.html for client-side routing", () => {
    const content = fs.readFileSync(vercelConfigPath, "utf-8");
    const config = JSON.parse(content);

    expect(Array.isArray(config.rewrites)).toBe(true);
    const catchAllRewrite = config.rewrites.find(
      (r: { source: string; destination: string }) =>
        (r.source === "/(.*)" || r.source === "/:path*") && r.destination === "/index.html"
    );

    expect(catchAllRewrite).toBeDefined();
    expect(catchAllRewrite.destination).toBe("/index.html");
  });

  it("configures caching headers for immutable assets and dynamic index.html", () => {
    const content = fs.readFileSync(vercelConfigPath, "utf-8");
    const config = JSON.parse(content);

    expect(Array.isArray(config.headers)).toBe(true);

    // Check assets caching
    const assetHeaderRule = config.headers.find((h: { source: string }) =>
      h.source.includes("assets")
    );
    expect(assetHeaderRule).toBeDefined();
    const assetCacheControl = assetHeaderRule.headers.find(
      (header: { key: string; value: string }) => header.key.toLowerCase() === "cache-control"
    );
    expect(assetCacheControl).toBeDefined();
    expect(assetCacheControl.value).toContain("immutable");

    // Check index.html revalidation
    const indexHeaderRule = config.headers.find((h: { source: string }) =>
      h.source.includes("index.html")
    );
    expect(indexHeaderRule).toBeDefined();
    const indexCacheControl = indexHeaderRule.headers.find(
      (header: { key: string; value: string }) => header.key.toLowerCase() === "cache-control"
    );
    expect(indexCacheControl).toBeDefined();
    expect(indexCacheControl.value).toContain("must-revalidate");
  });

  it("configures essential security headers", () => {
    const content = fs.readFileSync(vercelConfigPath, "utf-8");
    const config = JSON.parse(content);

    const allHeaders = config.headers.flatMap((h: { headers: Array<{ key: string; value: string }> }) => h.headers);
    const nosniff = allHeaders.find(
      (header: { key: string }) => header.key.toLowerCase() === "x-content-type-options"
    );
    expect(nosniff).toBeDefined();
    expect(nosniff.value).toBe("nosniff");
  });
});
