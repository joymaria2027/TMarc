import { supabase } from "@/integrations/supabase/client";

const FALLBACK_FEE = 100;

/**
 * Resolve delivery fee for a merchant given a free-text customer address.
 * Matches case-insensitive substring against merchant_tariffs.location_name.
 * Falls back to the merchant's lowest tariff, then to flat 100.
 */
export async function resolveDeliveryFee(merchantId: string, address: string): Promise<number> {
  const { data } = await supabase
    .from("merchant_tariffs")
    .select("location_name, tariff_amount")
    .eq("merchant_id", merchantId);

  const tariffs = data || [];
  if (tariffs.length === 0) return FALLBACK_FEE;

  const addr = (address || "").toLowerCase().trim();
  if (addr) {
    const match = tariffs.find(t =>
      addr.includes((t.location_name || "").toLowerCase()) ||
      (t.location_name || "").toLowerCase().includes(addr)
    );
    if (match) return Number(match.tariff_amount);
  }
  // fallback: cheapest known tariff for that merchant
  const min = tariffs.reduce((m, t) => Math.min(m, Number(t.tariff_amount)), Infinity);
  return isFinite(min) ? min : FALLBACK_FEE;
}
