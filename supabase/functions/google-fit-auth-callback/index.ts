import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code, state, redirect_uri } = await req.json();

    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Missing code or state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("GOOGLE_FIT_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_FIT_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Google Fit not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string;
    try {
      const decoded = JSON.parse(atob(state));
      userId = decoded.user_id;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid state parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect_uri || "",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData);
      return new Response(JSON.stringify({ error: "Token exchange failed", details: tokenData }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const { error: upsertErr } = await supabase
      .from("wearable_connections")
      .upsert(
        {
          client_id: userId,
          provider: "google_fit",
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
          sync_status: "connected",
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,provider" }
      );

    if (upsertErr) {
      console.error("Failed to store tokens:", upsertErr);
      return new Response(JSON.stringify({ error: "Failed to store connection" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Immediately sync last 7 days of step data
    try {
      const now = Date.now();
      const start = now - 7 * 86400000;
      const stepsRes = await fetch(
        "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
            bucketByTime: { durationMillis: 86400000 },
            startTimeMillis: start,
            endTimeMillis: now,
          }),
        }
      );
      const stepsData = await stepsRes.json();
      const metrics = (stepsData.bucket || []).map((b: any) => ({
        client_id: userId,
        metric_type: "steps",
        value: b.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal || 0,
        recorded_date: new Date(parseInt(b.startTimeMillis)).toISOString().split("T")[0],
        provider: "google_fit",
        created_at: new Date().toISOString(),
      }));

      if (metrics.length > 0) {
        await supabase
          .from("client_health_metrics")
          .upsert(metrics, { onConflict: "client_id,metric_type,recorded_date,provider" });

        const dhmRows = metrics.map((m: any) => ({
          user_id: userId,
          metric_date: m.recorded_date,
          steps: m.value,
          source: "google_fit",
          synced_at: new Date().toISOString(),
        }));
        await supabase
          .from("daily_health_metrics")
          .upsert(dhmRows, { onConflict: "user_id,metric_date" });
      }

      await supabase
        .from("wearable_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("client_id", userId)
        .eq("provider", "google_fit");
    } catch (syncErr) {
      console.error("Initial Google Fit sync failed (non-blocking):", syncErr);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
