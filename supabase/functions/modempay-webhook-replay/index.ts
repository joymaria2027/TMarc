import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processWebhookEvent } from "../_shared/modempay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    const { data: isDev } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "app_developer" });
    if (!isAdmin && !isDev) return json({ error: "forbidden" }, 403);

    const { event_id } = await req.json();
    if (!event_id) return json({ error: "event_id required" }, 400);

    const { data: evt, error } = await admin
      .from("modempay_webhook_events")
      .select("*")
      .eq("id", event_id)
      .single();
    if (error || !evt) return json({ error: "event not found" }, 404);

    const result = await processWebhookEvent(
      admin,
      evt.raw_body ?? JSON.stringify(evt.payload_json ?? {}),
      evt.signature_header ?? "",
      { retryOfId: evt.id, skipSignature: true },
    );

    return json({ ok: true, detail: result.body, log_id: result.logId });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
