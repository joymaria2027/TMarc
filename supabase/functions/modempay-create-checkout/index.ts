import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);

    const { order_id, return_url } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    const { data: order, error } = await admin.from("orders").select("*").eq("id", order_id).single();
    if (error || !order) return json({ error: "order not found" }, 404);

    // verify ownership
    const { data: customer } = await admin.from("customers").select("user_id").eq("id", order.customer_id).single();
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (customer?.user_id !== u.user.id && !isAdmin) return json({ error: "forbidden" }, 403);

    if (order.payment_status === "paid") return json({ error: "already paid" }, 400);

    const apiKey = Deno.env.get("MODEMPAY_API_KEY");
    if (!apiKey) {
      // Fail closed: never simulate payments in a deployed function.
      console.error("MODEMPAY_API_KEY is not configured");
      return json({ error: "payment unavailable" }, 500);
    }

    // Call ModemPay Payment Intent API
    // Docs: https://docs.modempay.com/api-reference/create-a-payment-intent
    const mpRes = await fetch("https://api.modempay.com/v1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        data: {
          amount: Number(order.total),
          currency: order.currency ?? "GMD",
          title: `Order ${order.order_reference}`,
          description: `Payment for order ${order.order_reference}`,
          return_url: return_url ?? `${new URL(req.url).origin}/account/orders`,
          cancel_url: return_url ?? `${new URL(req.url).origin}/cart`,
          callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/modempay-webhook`,
          skip_url_validation: false,
          metadata: { order_id, order_reference: order.order_reference },
        },
      }),
    });

    if (!mpRes.ok) {
      const txt = await mpRes.text();
      console.error("ModemPay create-intent failed", mpRes.status, txt);
      return json({ error: "ModemPay error", status: mpRes.status, details: txt }, 502);
    }
    const mp = await mpRes.json();
    const payment = mp?.data ?? mp?.payload ?? mp;
    const paymentReference = payment?.payment_intent_id ?? payment?.id ?? payment?.reference ?? order.order_reference;
    const redirectUrl = payment?.payment_link ?? payment?.checkout_url ?? payment?.url ?? payment?.link;

    if (!redirectUrl) {
      console.error("ModemPay checkout link missing", JSON.stringify({ keys: Object.keys(payment ?? {}), rootKeys: Object.keys(mp ?? {}) }));
      return json({ error: "ModemPay checkout link missing" }, 502);
    }

    await admin.from("orders").update({
      payment_provider: "modempay",
      payment_reference: paymentReference,
    }).eq("id", order_id);

    return json({ ok: true, redirect_url: redirectUrl, payment_reference: paymentReference });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
