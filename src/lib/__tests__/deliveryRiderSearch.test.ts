import { describe, it, expect } from "vitest";
import {
  buildRiderSearchOr,
  escapePostgrestLikePattern,
  isRiderSearchActive,
  normalizeRiderSearchQuery,
  rowMatchesRiderSearch,
} from "../deliveryRiderSearch";

describe("normalizeRiderSearchQuery", () => {
  it("trims whitespace and passes inner text through", () => {
    expect(normalizeRiderSearchQuery("  John Doe  ")).toBe("John Doe");
    expect(normalizeRiderSearchQuery("jane@example.com")).toBe("jane@example.com");
  });

  it("maps null/undefined/blank to empty", () => {
    expect(normalizeRiderSearchQuery(null)).toBe("");
    expect(normalizeRiderSearchQuery(undefined)).toBe("");
    expect(normalizeRiderSearchQuery("   ")).toBe("");
  });
});

describe("isRiderSearchActive", () => {
  it("is inactive for empty or blank queries", () => {
    expect(isRiderSearchActive("")).toBe(false);
    expect(isRiderSearchActive("   ")).toBe(false);
    expect(isRiderSearchActive(null)).toBe(false);
    expect(isRiderSearchActive(undefined)).toBe(false);
  });

  it("is active for any non-blank query", () => {
    expect(isRiderSearchActive("john")).toBe(true);
    expect(isRiderSearchActive("  john  ")).toBe(true);
  });
});

describe("escapePostgrestLikePattern", () => {
  it("escapes LIKE specials (backslash first)", () => {
    expect(escapePostgrestLikePattern("100%_x\\y")).toBe("100\\%\\_x\\\\y");
  });

  it("maps or()-syntax breakers (comma/parens) to single-char wildcards", () => {
    expect(escapePostgrestLikePattern("John, Doe")).toBe("John_ Doe");
    expect(escapePostgrestLikePattern("a(b)c")).toBe("a_b_c");
  });

  it("leaves plain text untouched", () => {
    expect(escapePostgrestLikePattern("John Doe")).toBe("John Doe");
  });
});

describe("buildRiderSearchOr (ilike composition)", () => {
  it("returns null for empty queries (unfiltered passthrough)", () => {
    expect(buildRiderSearchOr("")).toBeNull();
    expect(buildRiderSearchOr("   ")).toBeNull();
    expect(buildRiderSearchOr(null)).toBeNull();
  });

  it("composes ilike across profiles.full_name, profiles.email, riders.license_plate", () => {
    expect(buildRiderSearchOr("john")).toBe(
      "profiles.full_name.ilike.*john*,profiles.email.ilike.*john*,riders.license_plate.ilike.*john*",
    );
  });

  it("trims the query before composing", () => {
    expect(buildRiderSearchOr("  jane  ")).toBe(
      "profiles.full_name.ilike.*jane*,profiles.email.ilike.*jane*,riders.license_plate.ilike.*jane*",
    );
  });

  it("escapes LIKE wildcards inside the pattern", () => {
    expect(buildRiderSearchOr("50% off")).toBe(
      "profiles.full_name.ilike.*50\\% off*,profiles.email.ilike.*50\\% off*,riders.license_plate.ilike.*50\\% off*",
    );
  });

  it("escapes or()-syntax breakers", () => {
    expect(buildRiderSearchOr("John, Doe")).toBe(
      "profiles.full_name.ilike.*John_ Doe*,profiles.email.ilike.*John_ Doe*,riders.license_plate.ilike.*John_ Doe*",
    );
  });
});

describe("rowMatchesRiderSearch (realtime gate)", () => {
  const row = {
    riders: {
      license_plate: "ABC-123",
      profiles: { full_name: "John Doe", email: "john@example.com" },
    },
    rider_license_plate: "ABC-123",
    rider_full_name: "John Doe",
    rider_email: "john@example.com",
  };

  it("passes everything on empty query", () => {
    expect(rowMatchesRiderSearch(row, "")).toBe(true);
    expect(rowMatchesRiderSearch(row, "   ")).toBe(true);
  });

  it("matches license_plate case-insensitively", () => {
    expect(rowMatchesRiderSearch(row, "abc-123")).toBe(true);
    expect(rowMatchesRiderSearch(row, "ABC")).toBe(true);
  });

  it("matches full_name case-insensitively", () => {
    expect(rowMatchesRiderSearch(row, "john doe")).toBe(true);
    expect(rowMatchesRiderSearch(row, "JOHN")).toBe(true);
  });

  it("matches email case-insensitively", () => {
    expect(rowMatchesRiderSearch(row, "john@example.com")).toBe(true);
    expect(rowMatchesRiderSearch(row, "EXAMPLE")).toBe(true);
  });

  it("rejects misses", () => {
    expect(rowMatchesRiderSearch(row, "nope")).toBe(false);
  });

  it("supports realtime-shaped rows with only flat projections", () => {
    const flatRow = {
      rider_license_plate: "XYZ-789",
      rider_full_name: "Jane Smith",
      rider_email: "jane@example.com",
      riders: null,
    };
    expect(rowMatchesRiderSearch(flatRow, "xyz-789")).toBe(true);
    expect(rowMatchesRiderSearch(flatRow, "jane smith")).toBe(true);
    expect(rowMatchesRiderSearch(flatRow, "jane@example.com")).toBe(true);
    expect(rowMatchesRiderSearch(flatRow, "nope")).toBe(false);
  });

  it("supports realtime-shaped rows with only nested join", () => {
    const nestedRow = {
      riders: {
        license_plate: "DEF-456",
        profiles: { full_name: "Bob Wilson", email: "bob@example.com" },
      },
    };
    expect(rowMatchesRiderSearch(nestedRow, "def-456")).toBe(true);
    expect(rowMatchesRiderSearch(nestedRow, "bob wilson")).toBe(true);
    expect(rowMatchesRiderSearch(nestedRow, "bob@example.com")).toBe(true);
    expect(rowMatchesRiderSearch(nestedRow, "nope")).toBe(false);
  });

  it("handles null rider data gracefully", () => {
    const emptyRow = {
      riders: null,
      rider_license_plate: null,
      rider_full_name: null,
      rider_email: null,
    };
    expect(rowMatchesRiderSearch(emptyRow, "")).toBe(true);
    expect(rowMatchesRiderSearch(emptyRow, "john")).toBe(false);
  });
});