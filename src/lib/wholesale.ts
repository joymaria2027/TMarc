import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface WholesaleQuote {
  price: number;
  retailPrice: number;
  minQty: number;
  isWholesale: boolean;
}

interface PricingRow { product_id: string; wholesale_price: number | null; min_quantity: number }
interface SettingsRow { merchant_id: string; is_enabled: boolean; discount_percent: number; min_quantity: number }

export function useWholesale() {
  const { user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Record<string, PricingRow>>({});
  const [settings, setSettings] = useState<Record<string, SettingsRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) { setStatus(null); setPricing({}); setSettings({}); setLoading(false); }
        return;
      }
      const { data: appRow } = await (supabase.from("wholesalers" as any)
        .select("approval_status").eq("user_id", user.id).maybeSingle() as any);
      const st = (appRow as any)?.approval_status ?? null;
      if (cancelled) return;
      setStatus(st);
      if (st === "approved") {
        const [pw, mw] = await Promise.all([
          (supabase.from("product_wholesale_pricing" as any).select("product_id,wholesale_price,min_quantity") as any),
          (supabase.from("merchant_wholesale_settings" as any).select("merchant_id,is_enabled,discount_percent,min_quantity") as any),
        ]);
        if (cancelled) return;
        const pMap: Record<string, PricingRow> = {};
        for (const r of ((pw.data || []) as PricingRow[])) pMap[r.product_id] = r;
        const sMap: Record<string, SettingsRow> = {};
        for (const r of ((mw.data || []) as SettingsRow[])) sMap[r.merchant_id] = r;
        setPricing(pMap);
        setSettings(sMap);
      } else {
        setPricing({});
        setSettings({});
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isWholesaler = status === "approved";

  const quote = useCallback((p: { id: string; merchant_id: string; price: number | string }): WholesaleQuote => {
    const retailPrice = Number(p.price);
    if (!isWholesaler) return { price: retailPrice, retailPrice, minQty: 1, isWholesale: false };

    const row = pricing[p.id];
    if (row && row.wholesale_price != null) {
      return {
        price: Number(row.wholesale_price),
        retailPrice,
        minQty: Math.max(1, row.min_quantity || 1),
        isWholesale: Number(row.wholesale_price) < retailPrice,
      };
    }
    const s = settings[p.merchant_id];
    if (s && s.is_enabled && Number(s.discount_percent) > 0) {
      const price = Math.round(retailPrice * (1 - Number(s.discount_percent) / 100) * 100) / 100;
      return { price, retailPrice, minQty: Math.max(1, s.min_quantity || 1), isWholesale: true };
    }
    return { price: retailPrice, retailPrice, minQty: 1, isWholesale: false };
  }, [isWholesaler, pricing, settings]);

  return { isWholesaler, status, quote, loading };
}
