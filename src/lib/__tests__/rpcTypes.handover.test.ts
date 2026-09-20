import { describe, it, expect, vi } from "vitest";

// Ticket: handover-code/02 — typed wrappers for the handover-code RPCs.
// The wrappers must pass the delivery id and a NUMERIC code (the DB signature
// is integer — a string would error server-side), and stay detached-call-safe
// (supabase.rpc(...) must be invoked as a method, see rpcTypes.ts notes).

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import { rpcVerifyHandoverCode, rpcGetMyHandoverCode } from "../rpcTypes";

describe("handover code RPC wrappers", () => {
  it("verify passes the delivery id and a numeric code", () => {
    rpc.mockResolvedValue({ data: true, error: null });
    rpcVerifyHandoverCode("d1", 123456);
    expect(rpc).toHaveBeenCalledWith("verify_delivery_handover_code", {
      _delivery_id: "d1",
      _code: 123456,
    });
  });

  it("get-my-code passes the delivery id", () => {
    rpc.mockResolvedValue({ data: 654321, error: null });
    rpcGetMyHandoverCode("d2");
    expect(rpc).toHaveBeenCalledWith("get_my_handover_code", {
      _delivery_id: "d2",
    });
  });
});
