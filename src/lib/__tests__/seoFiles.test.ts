import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("SEO Static Files (sitemap.xml & robots.txt)", () => {
  const publicDir = path.resolve(__dirname, "../../../public");
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  const robotsPath = path.join(publicDir, "robots.txt");

  describe("public/sitemap.xml", () => {
    it("exists and has valid XML sitemap structure", () => {
      expect(fs.existsSync(sitemapPath), "sitemap.xml must exist in public/").toBe(true);
      const content = fs.readFileSync(sitemapPath, "utf-8");

      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
      expect(content).toContain("</urlset>");
    });

    it("indexes all primary public routes", () => {
      const content = fs.readFileSync(sitemapPath, "utf-8");

      // Required public routes
      const expectedPaths = ["/", "/shop", "/wholesale", "/privacy", "/auth"];

      for (const p of expectedPaths) {
        // Must contain an entry ending with or matching the path
        expect(content).toMatch(new RegExp(`<loc>https?://[^<]+${p === "/" ? "/?" : p}</loc>`));
      }
    });
  });

  describe("public/robots.txt", () => {
    it("exists and specifies the Sitemap location", () => {
      expect(fs.existsSync(robotsPath), "robots.txt must exist in public/").toBe(true);
      const content = fs.readFileSync(robotsPath, "utf-8");

      expect(content).toMatch(/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml/i);
    });

    it("allows public routes while disallowing sensitive back-office routes", () => {
      const content = fs.readFileSync(robotsPath, "utf-8");

      expect(content).toContain("User-agent: *");

      // Protected admin, dispatch, and finance paths must be disallowed
      const protectedPaths = [
        "/admin/",
        "/deliveries",
        "/settlements",
        "/payroll",
        "/wallet",
        "/account/",
      ];

      for (const p of protectedPaths) {
        expect(content).toContain(`Disallow: ${p}`);
      }
    });
  });
});
