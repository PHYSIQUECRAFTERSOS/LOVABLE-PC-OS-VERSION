import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshFitbitToken(refreshToken: string, clientId: string, clientSecret: string) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return await res.json();
}

async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id, provider, access_token, start_date, end_date } = await req.json();

    if (!client_id || !provider) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the stored connection to check token freshness
    let token = access_token;
    const { data: conn } = await supabase
      .from("wearable_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("client_id", client_id)
      .eq("provider", provider)
      .maybeSingle();

    if (conn) {
      // Use stored token if none provided
      if (!token) token = conn.access_token;

      // Check if token is expired and refresh
      if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date() && conn.refresh_token) {
        console.log(`Token expired for ${provider}, refreshing...`);
        let refreshResult;

        if (provider === "fitbit") {
          const cId = Deno.env.get("FITBIT_CLIENT_ID");
          const cSecret = Deno.env.get("FITBIT_CLIENT_SECRET");
          if (cId && cSecret) {
            refreshResult = await refreshFitbitToken(conn.refresh_token, cId, cSecret);
          }
        } else if (provider === "google_fit") {
          const cId = Deno.env.get("GOOGLE_FIT_CLIENT_ID");
          const cSecret = Deno.env.get("GOOGLE_FIT_CLIENT_SECRET");
          if (cId && cSecret) {
            refreshResult = await refreshGoogleToken(conn.refresh_token, cId, cSecret);
          }
        }

        if (refreshResult?.access_token) {
          token = refreshResult.access_token;
          const expiresAt = new Date(Date.now() + refreshResult.expires_in * 1000).toISOString();
          await supabase
            .from("wearable_connections")
            .update({
              access_token: refreshResult.access_token,
              refresh_token: refreshResult.refresh_token || conn.refresh_token,
              token_expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("client_id", client_id)
            .eq("provider", provider);
          console.log(`Token refreshed for ${provider}`);
        }
      }
    }

    if (!token) {
      return new Response(JSON.stringify({ error: "No access token available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let metrics: Array<{ date: string; steps: number }> = [];

    if (provider === "fitbit") {
      const res = await fetch(
        `https://api.fitbit.com/1/user/-/activities/steps/date/${start_date}/${end_date}.json`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (data.errors) {
        console.error("Fitbit API error:", data.errors);
        await supabase
          .from("wearable_connections")
          .update({ sync_status: "error", error_message: data.errors[0]?.message || "API error" })
          .eq("client_id", client_id)
          .eq("provider", provider);
        return new Response(JSON.stringify({ error: "Fitbit API error", details: data.errors }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      metrics = (data["activities-steps"] || []).map((d: any) => ({
        date: d.dateTime,
        steps: parseInt(d.value, 10),
      }));
    } else if (provider === "google_fit") {
      const res = await fetch(
        "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
            bucketByTime: { durationMillis: 86400000 },
            startTimeMillis: Math.floor(new Date(start_date).getTime()),
            endTimeMillis: Math.floor(new Date(end_date).getTime()),
          }),
        }
      );
      const data = await res.json();

      if (data.error) {
        console.error("Google Fit API error:", data.error);
        await supabase
          .from("wearable_connections")
          .update({ sync_status: "error", error_message: data.error.message || "API error" })
          .eq("client_id", client_id)
          .eq("provider", provider);
        return new Response(JSON.stringify({ error: "Google Fit API error", details: data.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      metrics = (data.bucket || []).map((b: any) => ({
        date: new Date(parseInt(b.startTimeMillis)).toISOString().split("T")[0],
        steps: b.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal || 0,
      }));
    }

    // Upsert metrics into client_health_metrics
    if (metrics.length > 0) {
      const rows = metrics.map((m) => ({
        client_id,
        metric_type: "steps",
        value: m.steps,
        recorded_date: m.date,
        provider,
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("client_health_metrics")
        .upsert(rows, { onConflict: "client_id,metric_type,recorded_date,provider" });

      if (error) throw error;

      // Also upsert into daily_health_metrics for backward compat
      const dhmRows = metrics.map((m) => ({
        user_id: client_id,
        metric_date: m.date,
        steps: m.steps,
        source: provider,
        synced_at: new Date().toISOString(),
      }));

      await supabase
        .from("daily_health_metrics")
        .upsert(dhmRows, { onConflict: "user_id,metric_date" });
    }

    // Update wearable connection sync status
    await supabase
      .from("wearable_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: "connected",
        error_message: null,
      })
      .eq("client_id", client_id)
      .eq("provider", provider);

    return new Response(
      JSON.stringify({ success: true, records_synced: metrics.length }),
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
