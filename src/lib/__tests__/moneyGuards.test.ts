import { describe, it, expect } from "vitest";
import {
  partitionPayoutDeliveries,
  validateRunPeriod,
  confidenceBand,
  requiresReviewReason,
  partitionWithdrawableRequests,
  WITHDRAWAL_BULK_ALLOWED_STATUSES,
} from "../moneyGuards";

describe("validateRunPeriod (payroll run guard)", () => {
  it("requires both dates", () => {
    expect(validateRunPeriod("", "2026-09-18")).toMatch(/start and end/i);
    expect(validateRunPeriod("2026-08-18", "")).toMatch(/start and end/i);
  });

  it("rejects reversed range", () => {
    expect(validateRunPeriod("2026-09-18", "2026-08-18")).toMatch(/before/i);
  });

  it("accepts valid range", () => {
    expect(validateRunPeriod("2026-08-18", "2026-09-18")).toBeNull();
    expect(validateRunPeriod("2026-09-18", "2026-09-18")).toBeNull();
  });
});

describe("partitionPayoutDeliveries (honest payout toast)", () => {
  const d = (id: string, approved: boolean, sharing: object | null) => ({
    id,
    settlement_approved: approved,
    sharing,
  });

  it("approves only unapproved deliveries with a sharing ratio", () => {
    const { approvable, skippedNoRatio } = partitionPayoutDeliveries([
      d("a", false, { rider_percentage: 50 }),
      d("b", false, null),
      d("c", true, { rider_percentage: 50 }),
      d("e", true, null),
    ]);
    expect(approvable.map((x) => x.id)).toEqual(["a"]);
    expect(skippedNoRatio.map((x) => x.id)).toEqual(["b"]);
  });

  it("is empty-safe", () => {
    expect(partitionPayoutDeliveries([])).toEqual({ approvable: [], skippedNoRatio: [] });
  });
});

describe("confidenceBand (expense auto-verify grades)", () => {
  it("grades A at 85+, B at 60-84, C below 60", () => {
    expect(confidenceBand(100)).toBe("A");
    expect(confidenceBand(85)).toBe("A");
    expect(confidenceBand(84)).toBe("B");
    expect(confidenceBand(60)).toBe("B");
    expect(confidenceBand(59)).toBe("C");
    expect(confidenceBand(0)).toBe("C");
  });

  it("treats unscored legacy rows as B (today's behavior)", () => {
    expect(confidenceBand(null)).toBe("B");
    expect(confidenceBand(undefined)).toBe("B");
  });

  it("requires a reason only for C-band", () => {
    expect(requiresReviewReason(59)).toBe(true);
    expect(requiresReviewReason(60)).toBe(false);
    expect(requiresReviewReason(95)).toBe(false);
    expect(requiresReviewReason(null)).toBe(false);
  });
});

describe("partitionWithdrawableRequests (bulk withdrawal guard)", () => {
  const row = (status: string, id = status) => ({ id, status });
  // Every status that appears in WithdrawalRequestsTable's badge map. `processing`
  // is in `map` but missing from `labels` — a separate pre-existing defect we
  // must still have a rule for, or it becomes an accidental default.
  const ALL_STATUSES = ['pending', 'manager_approved', 'processing', 'completed', 'rejected'];

  it("approve acts only on pending", () => {
    expect(partitionWithdrawableRequests([row('pending')], 'approve').actionable).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('manager_approved')], 'approve').skippedWrongState).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('rejected')], 'approve').skippedWrongState).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('processing')], 'approve').skippedWrongState).toHaveLength(1);
  });

  // THE regression this guard exists for: approving a completed withdrawal
  // rewinds it, and the next finalize runs the wallet debit a second time.
  it("approve refuses to rewind a completed withdrawal", () => {
    const { actionable, skippedWrongState } = partitionWithdrawableRequests(
      [row('completed', 'done-1')],
      'approve',
    );
    expect(actionable).toHaveLength(0);
    expect(skippedWrongState.map(r => r.id)).toEqual(['done-1']);
  });

  it("approve refuses manager_approved, which would discard the accountant's turn", () => {
    expect(partitionWithdrawableRequests([row('manager_approved')], 'approve').actionable).toHaveLength(0);
  });

  it("reject acts on pending and manager_approved only", () => {
    expect(partitionWithdrawableRequests([row('pending')], 'reject').actionable).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('manager_approved')], 'reject').actionable).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('completed')], 'reject').skippedWrongState).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('processing')], 'reject').skippedWrongState).toHaveLength(1);
  });

  it("has an explicit rule for every known status, and skips unknown ones", () => {
    for (const status of ALL_STATUSES) {
      const { actionable, skippedWrongState } = partitionWithdrawableRequests([row(status)], 'approve');
      expect(actionable.length + skippedWrongState.length).toBe(1);
    }
    // A status nobody has classified is skipped, which is the safe default.
    expect(partitionWithdrawableRequests([row('brand_new_state')], 'approve').skippedWrongState).toHaveLength(1);
    expect(partitionWithdrawableRequests([row('brand_new_state')], 'reject').skippedWrongState).toHaveLength(1);
  });

  it("returns empty arrays for an empty selection", () => {
    const r = partitionWithdrawableRequests([], 'approve');
    expect(r.actionable).toEqual([]);
    expect(r.skippedWrongState).toEqual([]);
  });

  it("puts everything in skippedWrongState when nothing is actionable", () => {
    const rows = [row('completed', 'a'), row('rejected', 'b'), row('processing', 'c')];
    const { actionable, skippedWrongState } = partitionWithdrawableRequests(rows, 'approve');
    expect(actionable).toEqual([]);
    expect(skippedWrongState.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });

  it("partitions a mixed selection without losing rows", () => {
    const rows = [row('pending', 'p1'), row('completed', 'c1'), row('pending', 'p2'), row('manager_approved', 'm1')];
    const { actionable, skippedWrongState } = partitionWithdrawableRequests(rows, 'approve');
    expect(actionable.map(r => r.id)).toEqual(['p1', 'p2']);
    expect(skippedWrongState.map(r => r.id)).toEqual(['c1', 'm1']);
  });

  it("preserves generic row type so callers keep their extra fields", () => {
    const rows = [{ id: '1', status: 'pending', amount: 50 }];
    expect(partitionWithdrawableRequests(rows, 'approve').actionable[0].amount).toBe(50);
  });

  it("exposes allowed statuses matching the partition, for the .in() predicate", () => {
    expect(WITHDRAWAL_BULK_ALLOWED_STATUSES.approve).toEqual(['pending']);
    expect(WITHDRAWAL_BULK_ALLOWED_STATUSES.reject).toEqual(['pending', 'manager_approved']);
    // The predicate must never admit `completed` for either action.
    for (const statuses of Object.values(WITHDRAWAL_BULK_ALLOWED_STATUSES)) {
      expect(statuses).not.toContain('completed');
    }
  });
});
