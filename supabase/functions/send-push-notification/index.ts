import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Build APNs JWT from .p8 key
async function buildApnsJwt(
  keyBase64: string,
  keyId: string,
  teamId: string
): Promise<string> {
  const header = { alg: "ES256", kid: keyId };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: teamId, iat: now };

  const enc = new TextEncoder();
  const b64url = (buf: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const headerB64 = b64url(enc.encode(JSON.stringify(header)));
  const claimsB64 = b64url(enc.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;

  // Decode PEM key
  const pemClean = atob(keyBase64);
  const keyBytes = new Uint8Array([...pemClean].map((c) => c.charCodeAt(0)));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    enc.encode(signingInput)
  );

  // Convert DER signature to raw r||s (64 bytes)
  const sigArray = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;

  if (sigArray.length === 64) {
    r = sigArray.slice(0, 32);
    s = sigArray.slice(32);
  } else {
    // DER format
    const rLen = sigArray[3];
    const rStart = 4;
    const rBytes = sigArray.slice(rStart, rStart + rLen);
    const sLen = sigArray[rStart + rLen + 1];
    const sStart = rStart + rLen + 2;
    const sBytes = sigArray.slice(sStart, sStart + sLen);

    r = rBytes.length > 32 ? rBytes.slice(rBytes.length - 32) : rBytes;
    s = sBytes.length > 32 ? sBytes.slice(sBytes.length - 32) : sBytes;

    // Pad if needed
    if (r.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(r, 32 - r.length);
      r = padded;
    }
    if (s.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(s, 32 - s.length);
      s = padded;
    }
  }

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  return `${signingInput}.${b64url(rawSig)}`;
}

function shouldRemoveToken(status: number, responseText: string): boolean {
  if (status === 410) return true;
  if (status !== 400) return false;

  try {
    const parsed = responseText ? JSON.parse(responseText) : null;
    return parsed?.reason === "BadDeviceToken" || parsed?.reason === "Unregistered";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      user_id,
      title,
      body,
      data,
      notification_type = "message",
    } = await req.json();

    console.log("[Push] Received request — user_id:", user_id?.slice(0, 8), "type:", notification_type, "title:", title);

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check notification preferences
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select("messages_enabled, checkin_reminders_enabled")
      .eq("user_id", user_id)
      .maybeSingle();

    const messagesEnabled = prefs?.messages_enabled ?? true;
    const checkinEnabled = prefs?.checkin_reminders_enabled ?? true;

    if (notification_type === "message" && !messagesEnabled) {
      console.log("[Push] Skipped — messages disabled for user:", user_id.slice(0, 8));
      return new Response(
        JSON.stringify({ skipped: true, reason: "messages_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (notification_type === "checkin" && !checkinEnabled) {
      console.log("[Push] Skipped — checkin disabled for user:", user_id.slice(0, 8));
      return new Response(
        JSON.stringify({ skipped: true, reason: "checkin_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch device tokens — get ALL platforms
    const { data: tokens, error: tokenError } = await supabaseAdmin
      .from("push_tokens")
      .select("token, platform")
      .eq("user_id", user_id);

    console.log("[Push] Tokens found:", tokens?.length ?? 0, "error:", tokenError?.message ?? "none");

    if (!tokens?.length) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_tokens" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate badge count (unread messages)
    const { count: badgeCount } = await supabaseAdmin
      .from("thread_messages")
      .select("id, message_threads!inner(client_id, coach_id)", {
        count: "exact",
        head: true,
      })
      .or(`client_id.eq.${user_id},coach_id.eq.${user_id}`, {
        referencedTable: "message_threads",
      })
      .neq("sender_id", user_id)
      .is("read_at", null);

    const badge = badgeCount ?? 0;
    console.log("[Push] Badge count:", badge);

    // Get APNs credentials
    const apnsKeyBase64 = Deno.env.get("APNS_KEY_BASE64");
    const apnsKeyId = Deno.env.get("APNS_KEY_ID");
    const apnsTeamId = Deno.env.get("APNS_TEAM_ID");
    const bundleId = "com.physiquecrafters.app";

    if (!apnsKeyBase64 || !apnsKeyId || !apnsTeamId) {
      console.error("[Push] ❌ APNs credentials not configured");
      return new Response(
        JSON.stringify({ error: "APNs not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build JWT
    const jwt = await buildApnsJwt(apnsKeyBase64, apnsKeyId, apnsTeamId);
    console.log("[Push] APNs JWT built successfully");

    // Send to each device token
    const results = [];
    for (const { token, platform } of tokens) {
      const apnsPayload = {
        aps: {
          alert: { title, body },
          badge,
          sound: "default",
          "mutable-content": 1,
        },
        ...data,
      };

      try {
        console.log("[Push] Sending to token:", token.slice(0, 12) + "...", "platform:", platform);

        const response = await fetch(
          `https://api.push.apple.com/3/device/${token}`,
          {
            method: "POST",
            headers: {
              authorization: `bearer ${jwt}`,
              "apns-topic": bundleId,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "apns-expiration": "0",
              "content-type": "application/json",
            },
            body: JSON.stringify(apnsPayload),
          }
        );

        const responseText = await response.text();
        console.log("[Push] APNs response — status:", response.status, "body:", responseText || "(empty)");

        if (shouldRemoveToken(response.status, responseText)) {
          await supabaseAdmin
            .from("push_tokens")
            .delete()
            .eq("token", token);
          results.push({ token: token.slice(0, 8), status: "removed_invalid" });
          console.log("[Push] Removed invalid token:", token.slice(0, 12));
        } else {
          results.push({
            token: token.slice(0, 8),
            status: response.status,
            response: responseText || "ok",
          });
        }
      } catch (err) {
        console.error("[Push] ❌ Delivery error for token:", token.slice(0, 12), err);
        results.push({
          token: token.slice(0, 8),
          status: "error",
          error: (err as Error).message,
        });
      }
    }

    console.log("[Push] ✅ Complete — results:", JSON.stringify(results));
    return new Response(
      JSON.stringify({ sent: true, badge, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Push] ❌ Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
