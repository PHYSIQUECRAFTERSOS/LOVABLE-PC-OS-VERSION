import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id, provider, access_token, start_date, end_date } = await req.json();

    if (!client_id || !provider || !access_token) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let metrics: Array<{ date: string; steps: number }> = [];

    if (provider === "fitbit") {
      const res = await fetch(
        `https://api.fitbit.com/1/user/-/activities/steps/date/${start_date}/${end_date}.json`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      const data = await res.json();
      metrics = (data["activities-steps"] || []).map((d: any) => ({
        date: d.dateTime,
        steps: parseInt(d.value, 10),
      }));
    } else if (provider === "google_fit") {
      const res = await fetch(
        `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
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
      metrics = (data.bucket || []).map((b: any) => ({
        date: new Date(parseInt(b.startTimeMillis)).toISOString().split("T")[0],
        steps: b.dataset?.[0]?.point?.[0]?.value?.[0]?.intVal || 0,
      }));
    } else if (provider === "whoop") {
      // Whoop does not natively expose step counts via API yet
      // Placeholder for when the endpoint becomes available
      metrics = [];
    }
    // apple_health is handled client-side via HealthKit

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
