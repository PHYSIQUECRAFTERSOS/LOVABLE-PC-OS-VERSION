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

    const clientId = Deno.env.get("FITBIT_CLIENT_ID");
    const clientSecret = Deno.env.get("FITBIT_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Fitbit not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decode state to get user_id
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
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect_uri || "",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Fitbit token exchange failed:", tokenData);
      return new Response(JSON.stringify({ error: "Token exchange failed", details: tokenData }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store tokens in wearable_connections
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
          provider: "fitbit",
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
      const end = new Date().toISOString().split("T")[0];
      const start = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

      const stepsRes = await fetch(
        `https://api.fitbit.com/1/user/-/activities/steps/date/${start}/${end}.json`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );
      const stepsData = await stepsRes.json();
      const metrics = (stepsData["activities-steps"] || []).map((d: any) => ({
        client_id: userId,
        metric_type: "steps",
        value: parseInt(d.value, 10),
        recorded_date: d.dateTime,
        provider: "fitbit",
        created_at: new Date().toISOString(),
      }));

      if (metrics.length > 0) {
        await supabase
          .from("client_health_metrics")
          .upsert(metrics, { onConflict: "client_id,metric_type,recorded_date,provider" });

        // Also sync to daily_health_metrics
        const dhmRows = metrics.map((m: any) => ({
          user_id: userId,
          metric_date: m.recorded_date,
          steps: m.value,
          source: "fitbit",
          synced_at: new Date().toISOString(),
        }));
        await supabase
          .from("daily_health_metrics")
          .upsert(dhmRows, { onConflict: "user_id,metric_date" });
      }

      // Update last_synced_at
      await supabase
        .from("wearable_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("client_id", userId)
        .eq("provider", "fitbit");
    } catch (syncErr) {
      console.error("Initial sync failed (non-blocking):", syncErr);
    }

    return new Response(
      JSON.stringify({ success: true, fitbit_user_id: tokenData.user_id }),
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
