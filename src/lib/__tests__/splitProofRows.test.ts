import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { splitProofRows } from "@/lib/deliveries";

const clean = { id: "c1", picked_up_at: "2026-09-20T09:00:00Z", receipt_attached: false };
const proof = { id: "p1", picked_up_at: null, receipt_attached: false };
const receipted = { id: "r1", picked_up_at: null, receipt_attached: true };
const partial = { id: "x1", picked_up_at: null };

describe("splitProofRows (06-bulk-proof-gate)", () => {
  it("approves clean rows, holds proof rows", () => {
    const { approvable, held } = splitProofRows([clean, proof, receipted]);
    expect(approvable.map((r) => r.id)).toEqual(["c1", "r1"]);
    expect(held.map((r) => r.id)).toEqual(["p1"]);
  });

  it("never holds on partial data", () => {
    const { approvable, held } = splitProofRows([partial]);
    expect(approvable.map((r) => r.id)).toEqual(["x1"]);
    expect(held).toEqual([]);
  });

  it("handles empty selection", () => {
    expect(splitProofRows([])).toEqual({ approvable: [], held: [] });
  });
});

describe("bulk approve wiring (06-bulk-proof-gate)", () => {
  const page = fs.readFileSync(
    path.resolve(__dirname, "../../pages/SettlementsPage.tsx"),
    "utf8",
  );

  it("bulk approve partitions proof rows before writing", () => {
    expect(page).toMatch(/splitProofRows\(selected\)/);
  });

  it("bulk approve reports held counts honestly", () => {
    expect(page).toMatch(/skipped — no start proof, verify per-row before paying/);
  });

  it("held rows stay selected while approved rows clear", () => {
    expect(page).toMatch(/for \(const row of approvable\) next\.delete\(row\.id\)/);
  });
});
