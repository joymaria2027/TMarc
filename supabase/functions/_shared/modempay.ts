// Shared ModemPay webhook processing logic.

async function hmacHex(secret: string, body: string, hash: "SHA-256" | "SHA-512"): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right) || left.length !== right.length) return false;
  const leftDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(left));
  const rightDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(right));
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let diff = 0;
  for (let i = 0; i < leftBytes.length; i++) diff |= leftBytes[i] ^ rightBytes[i];
  return diff === 0;
}

async function isValidSignature(secret: string, rawBody: string, signatureHeader: string): Promise<boolean> {
  const cleanSecret = secret.trim().replace(/^['"]|['"]$/g, "");
  const candidates = signatureHeader
    .split(",")
    .map((part) => part.trim().replace(/^(?:sha256|sha512|v1)=/i, ""))
    .filter(Boolean);

  // ModemPay signs the raw JSON body with HMAC-SHA512. Try a few body variants
  // to guard against re-serialization differences.
  const bodyVariants = new Set<string>();
  bodyVariants.add(rawBody);
  try {
    const parsed = JSON.parse(rawBody);
    bodyVariants.add(JSON.stringify(parsed));
  } catch { /* ignore */ }

  const expected: string[] = [];
  for (const body of bodyVariants) {
    expected.push(await hmacHex(cleanSecret, body, "SHA-512"));
    expected.push(await hmacHex(cleanSecret, body, "SHA-256"));
  }

  for (const candidate of candidates) {
    for (const exp of expected) {
      if (await timingSafeEqualHex(candidate, exp)) return true;
    }
  }

  return false;
}

async function sha256Hex(body: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function processWebhookEvent(
  admin: any,
  rawBody: string,
  signatureHeader: string,
  opts?: { retryOfId?: string; skipSignature?: boolean },
) {
  const webhookSecret = Deno.env.get("MODEMPAY_WEBHOOK_SECRET");
  let signatureValid: boolean | null = null;
  if (webhookSecret && !opts?.skipSignature) {
    if (!signatureHeader) signatureValid = false;
    else signatureValid = await isValidSignature(webhookSecret, rawBody, signatureHeader);
  }

  let payload: any = null;
  try { payload = JSON.parse(rawBody); } catch { /* leave null */ }

  const eventType: string = payload?.event ?? payload?.type ?? "";
  const inner = payload?.payload ?? payload?.data ?? payload ?? {};
  const orderId: string | null =
    inner?.metadata?.order_id ??
    payload?.metadata?.order_id ??
    inner?.data?.metadata?.order_id ??
    null;
  const reference: string | null =
    inner?.payment_intent_id ?? inner?.id ?? inner?.reference ?? payload?.id ?? null;

  const rawEventId: string | null = payload?.id ?? inner?.event_id ?? null;
  const eventId = rawEventId ?? (eventType && inner?.id ? `${eventType}:${inner.id}` : await sha256Hex(rawBody));

  let dupOf: string | null = null;
  if (!opts?.retryOfId) {
    const { data: existing } = await admin
      .from("modempay_webhook_events")
      .select("id")
      .eq("event_id", eventId)
      .is("retry_of_id", null)
      .maybeSingle();
    if (existing) dupOf = existing.id;
  }

  const { data: logRow, error: logErr } = await admin
    .from("modempay_webhook_events")
    .insert({
      event_id: opts?.retryOfId ? `${eventId}:retry:${Date.now()}` : eventId,
      event_type: eventType || null,
      order_id: orderId,
      payment_reference: reference,
      signature_header: signatureHeader || null,
      signature_valid: signatureValid,
      payload_json: payload,
      raw_body: rawBody.length > 20000 ? rawBody.slice(0, 20000) : rawBody,
      processing_status: "pending",
      retry_of_id: opts?.retryOfId ?? null,
    })
    .select()
    .single();
  if (logErr) {
    console.error("failed to log webhook event", logErr);
    return { status: 500, body: { error: "log_failed" } };
  }

  const setStatus = async (processing_status: string, processing_error: string | null = null) => {
    await admin.from("modempay_webhook_events")
      .update({ processing_status, processing_error })
      .eq("id", logRow.id);
  };

  if (signatureValid === false) {
    // Fail closed: an invalid HMAC is rejected outright. Triage happens
    // out-of-band via the events table (or an admin replay), never inline.
    await setStatus("invalid_signature", "HMAC signature mismatch");
    return { status: 401, body: { error: "invalid signature" }, logId: logRow.id };
  }


  if (dupOf) {
    await setStatus("duplicate", `Already processed as ${dupOf}`);
    return { status: 200, body: { ok: true, duplicate: true }, logId: logRow.id };
  }

  let resolvedOrderId = orderId;
  if (!resolvedOrderId && reference) {
    const { data: orderByReference } = await admin
      .from("orders")
      .select("id")
      .eq("payment_reference", reference)
      .maybeSingle();
    resolvedOrderId = orderByReference?.id ?? null;
    if (resolvedOrderId) {
      await admin.from("modempay_webhook_events").update({ order_id: resolvedOrderId }).eq("id", logRow.id);
    }
  }

  if (!resolvedOrderId) {
    await setStatus("ignored", "no order_id in payload");
    return { status: 200, body: { ok: true, ignored: "no_order_id" }, logId: logRow.id };
  }

  const paymentState = String(inner?.status ?? payload?.status ?? "").toLowerCase();
  const isSuccess =
    /^(charge\.succeeded|payment_intent\.succeeded|payment\.succeeded|payment\.completed)$/.test(eventType) ||
    (/^(charge\.updated|payment_intent\.updated|payment\.updated)$/.test(eventType) && /^(completed|succeeded|paid)$/.test(paymentState));
  const isFail = /(cancelled|expired|failed)$/.test(eventType);

  try {
    const { data: order } = await admin.from("orders").select("id, payment_status, status, total").eq("id", resolvedOrderId).maybeSingle();
    if (!order) {
      await setStatus("ignored", "order not found");
      return { status: 200, body: { ok: true, ignored: "order_not_found" }, logId: logRow.id };
    }

    if (isSuccess) {
      // Record the server-verified payment before any fulfillment. submit_order
      // refuses to submit orders without a covering verification row (fail-closed).
      // ModemPay payload shapes vary: only enforce an amount comparison when the
      // event actually reports one; a reported shortfall blocks the order.
      const reportedAmount = Number(inner?.amount ?? payload?.amount ?? NaN);
      const orderTotal = Number(order.total);
      const hasReportedAmount = Number.isFinite(reportedAmount);
      const covers = !hasReportedAmount
        || (Number.isFinite(orderTotal) && reportedAmount + 0.009 >= orderTotal);
      const { error: verErr } = await admin
        .from("order_payment_verifications")
        .upsert({
          order_id: resolvedOrderId,
          provider: "modempay",
          payment_reference: reference,
          verified_amount: hasReportedAmount ? reportedAmount : 0,
          amount_covers_order: covers,
          source_event_id: String(eventId),
        }, { onConflict: "order_id,provider" });
      if (verErr) throw verErr;
      if (!covers) {
        await setStatus("ignored", `reported amount ${reportedAmount} does not cover order total ${orderTotal}`);
        return { status: 200, body: { ok: true, ignored: "amount_mismatch" }, logId: logRow.id };
      }

      if (order.payment_status === "paid") {
        // Paid but never submitted (e.g. earlier failure) — finish the job.
        if (order.status === "pending_payment") {
          const { error: rpcErr } = await admin.rpc("submit_order", { _order_id: resolvedOrderId });
          if (rpcErr) throw rpcErr;
          await setStatus("processed", "order was already paid; submitted now");
          return { status: 200, body: { ok: true, submitted: true }, logId: logRow.id };
        }
        await setStatus("duplicate", "order already paid");
        return { status: 200, body: { ok: true, already_paid: true }, logId: logRow.id };
      }

      const { error: upErr } = await admin.from("orders").update({
        payment_status: "paid",
        payment_reference: reference ?? undefined,
      }).eq("id", resolvedOrderId);
      if (upErr) throw upErr;
      const { error: rpcErr } = await admin.rpc("submit_order", { _order_id: resolvedOrderId });
      if (rpcErr) throw rpcErr;
      await setStatus("processed");
      return { status: 200, body: { ok: true, processed: true }, logId: logRow.id };
    } else if (isFail) {
      if (order.payment_status === "paid") {
        await setStatus("ignored", "cannot downgrade paid order");
        return { status: 200, body: { ok: true, ignored: "already_paid" }, logId: logRow.id };
      }
      await admin.from("orders").update({ payment_status: "failed" }).eq("id", resolvedOrderId);
      await setStatus("processed");
      return { status: 200, body: { ok: true, failed: true }, logId: logRow.id };
    } else {
      await setStatus("ignored", `unhandled event: ${eventType}`);
      return { status: 200, body: { ok: true, ignored: eventType }, logId: logRow.id };
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    console.error("webhook processing error", msg);
    await setStatus("failed", msg);
    return { status: 500, body: { error: msg }, logId: logRow.id };
  }
}
