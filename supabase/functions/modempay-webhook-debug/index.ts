import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function hmacHex(secret: string, body: string, hash: "SHA-256" | "SHA-512") {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    const { data: isDev } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "app_developer" });
    if (!isAdmin && !isDev) return json({ error: "forbidden" }, 403);

    const { event_id } = await req.json();
    const { data: evt, error } = await admin
      .from("modempay_webhook_events").select("*").eq("id", event_id).single();
    if (error || !evt) return json({ error: "not found" }, 404);

    const secretRaw = Deno.env.get("MODEMPAY_WEBHOOK_SECRET") ?? "";
    const secret = secretRaw.trim().replace(/^['"]|['"]$/g, "");
    const raw = evt.raw_body ?? "";
    let reser = "";
    try { reser = JSON.stringify(JSON.parse(raw)); } catch {}

    const sha512_raw = await hmacHex(secret, raw, "SHA-512");
    const sha256_raw = await hmacHex(secret, raw, "SHA-256");
    const sha512_reser = reser ? await hmacHex(secret, reser, "SHA-512") : null;

    return json({
      header: evt.signature_header,
      header_len: (evt.signature_header ?? "").length,
      raw_body_len: raw.length,
      reser_len: reser.length,
      body_matches_reser: raw === reser,
      secret_len: secret.length,
      secret_raw_len: secretRaw.length,
      secret_had_whitespace_or_quotes: secretRaw !== secret,
      computed: { sha512_raw, sha256_raw, sha512_reser },
      matches: {
        sha512_raw: sha512_raw === evt.signature_header,
        sha256_raw: sha256_raw === evt.signature_header,
        sha512_reser: sha512_reser === evt.signature_header,
      },
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
