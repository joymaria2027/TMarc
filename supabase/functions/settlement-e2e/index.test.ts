import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.test("settlement approval: prepaid fuel + amortized + wallet credits", async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const tag = `e2e-${Date.now()}`;
  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    // 1. Seed user, rider
    const email = `${tag}@e2e.local`;
    const { data: uRes, error: uErr } = await admin.auth.admin.createUser({
      email, password: "Test123!@#", email_confirm: true,
    });
    if (uErr) throw uErr;
    const userId = uRes.user!.id;
    cleanup.push(() => admin.auth.admin.deleteUser(userId));

    const { data: rider, error: rErr } = await admin.from("riders").insert({
      user_id: userId, vehicle_type: "motorcycle", license_plate: tag,
    }).select().single();
    if (rErr) throw rErr;
    cleanup.push(() => admin.from("riders").delete().eq("id", rider.id));

    // 2. Merchant
    const { data: merchant, error: mErr } = await admin.from("merchants").insert({
      name: tag, address: "test", is_active: true,
    }).select().single();
    if (mErr) throw mErr;
    cleanup.push(() => admin.from("merchants").delete().eq("id", merchant.id));

    // 3. Fuel expense type + variant (rate=5/mile) and amortized non-fuel type (over 50)
    const { data: fuelType } = await admin.from("expense_types").insert({
      name: `${tag}-fuel`, is_fuel: true, is_active: true, cost_per_mile: 5, applies_to: "rider",
    }).select().single();
    cleanup.push(() => admin.from("expense_types").delete().eq("id", fuelType!.id));

    const { data: variant } = await admin.from("fuel_variants").insert({
      expense_type_id: fuelType!.id, fuel_type: "petrol", cost_per_mile: 5, is_default: true, is_active: true,
    }).select().single();
    cleanup.push(() => admin.from("fuel_variants").delete().eq("id", variant!.id));

    await admin.from("riders").update({ fuel_variant_id: variant!.id }).eq("id", rider.id);

    const { data: amType } = await admin.from("expense_types").insert({
      name: `${tag}-other`, is_fuel: false, is_active: true, amortize_over: 50, applies_to: "rider", cost_per_mile: 0,
    }).select().single();
    cleanup.push(() => admin.from("expense_types").delete().eq("id", amType!.id));

    // 4. Approved prepaid fuel rider_expense D500 and amortized D1000
    const { data: fuelExp } = await admin.from("rider_expenses").insert({
      rider_id: rider.id, expense_type_id: fuelType!.id, uploaded_by: userId,
      description: `${tag}-fuel-row`, amount: 500, status: "approved",
    }).select().single();
    cleanup.push(() => admin.from("rider_expenses").delete().eq("id", fuelExp!.id));

    const { data: amExp } = await admin.from("rider_expenses").insert({
      rider_id: rider.id, merchant_id: merchant.id, expense_type_id: amType!.id, uploaded_by: userId,
      description: `${tag}-amort-row`, amount: 1000, status: "approved",
    }).select().single();
    cleanup.push(() => admin.from("rider_expenses").delete().eq("id", amExp!.id));

    // 5. Revenue sharing for merchant
    const { data: rev } = await admin.from("revenue_sharing").insert({
      merchant_id: merchant.id, rider_percentage: 70, merchant_percentage: 20,
      ucs_rides_percentage: 5, platform_percentage: 5,
    }).select().single();
    cleanup.push(() => admin.from("revenue_sharing").delete().eq("id", rev!.id));

    // 6. Delivery: 10 miles via odometer, tariff 300
    const { data: delv } = await admin.from("deliveries").insert({
      merchant_id: merchant.id, rider_id: rider.id,
      pickup_address: "a", dropoff_address: "b",
      customer_name: "c", customer_phone: "0",
      actual_tariff: 300, start_odometer_miles: 0, end_odometer_miles: 10,
      status: "delivered", order_reference: tag,
    }).select().single();
    cleanup.push(() => admin.from("deliveries").delete().eq("id", delv!.id));

    // 7. Approve settlement → triggers credit_wallets_on_settlement
    const { error: setErr } = await admin.from("deliveries")
      .update({ settlement_approved: true, settlement_approved_by: userId })
      .eq("id", delv!.id);
    if (setErr) throw setErr;

    // Expected: fuel=10*5=50, amortized=1000/50=20, net=300-50-20=230
    const expectedFuel = 50, expectedAmort = 20, expectedNet = 230;

    // 8. Verify consumptions
    const { data: cons } = await admin.from("rider_expense_consumptions")
      .select("*").eq("delivery_id", delv!.id);
    assertEquals(cons!.length, 2, "expected 2 consumption rows");
    const fuelCons = cons!.find((c: any) => c.kind === "fuel")!;
    const amCons = cons!.find((c: any) => c.kind === "amortized")!;
    assertEquals(Number(fuelCons.amount_consumed), expectedFuel);
    assertEquals(Number(amCons.amount_consumed), expectedAmort);
    assertEquals(fuelCons.rider_expense_id, fuelExp!.id);
    assertEquals(amCons.rider_expense_id, amExp!.id);

    // 9. rider_expenses.consumed_amount updated
    const { data: fuelAfter } = await admin.from("rider_expenses").select("consumed_amount").eq("id", fuelExp!.id).single();
    const { data: amAfter } = await admin.from("rider_expenses").select("consumed_amount").eq("id", amExp!.id).single();
    assertEquals(Number(fuelAfter!.consumed_amount), expectedFuel);
    assertEquals(Number(amAfter!.consumed_amount), expectedAmort);

    // 10. Wallets credited
    const { data: riderW } = await admin.from("wallets").select("balance")
      .eq("party_type", "rider").eq("party_id", rider.id).eq("merchant_id", merchant.id).single();
    assertEquals(Number(riderW!.balance), Math.round(expectedNet * 0.7 * 100) / 100);

    const { data: merchW } = await admin.from("wallets").select("balance")
      .eq("party_type", "merchant").eq("party_id", merchant.id).single();
    assert(Number(merchW!.balance) >= Math.round(expectedNet * 0.2 * 100) / 100);

    // 11. Wallet transaction description mentions the breakdown
    const { data: txs } = await admin.from("wallet_transactions")
      .select("description").eq("delivery_id", delv!.id);
    const allDesc = (txs || []).map((t: any) => t.description).join(" | ");
    assert(allDesc.includes("fuel D50"), `expected fuel D50 in tx: ${allDesc}`);
    assert(allDesc.includes("amortized D20"), `expected amortized D20 in tx: ${allDesc}`);
  } finally {
    // Cleanup wallets + tx first (no FK constraint relied on)
    for (const fn of cleanup.reverse()) {
      try { await fn(); } catch (_) { /* ignore */ }
    }
  }
});
