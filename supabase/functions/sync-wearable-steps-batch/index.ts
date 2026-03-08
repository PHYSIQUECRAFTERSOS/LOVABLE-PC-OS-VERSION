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

    // Fetch all active wearable connections (exclude Whoop until steps API available)
    const { data: connections, error } = await supabase
      .from("wearable_connections")
      .select("client_id, provider, access_token, refresh_token, token_expires_at")
      .in("provider", ["fitbit", "google_fit"])
      .eq("sync_status", "connected")
      .not("access_token", "is", null);

    if (error) throw error;
    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active connections to sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]; // Last 2 days to catch any missed data

    const results: Array<{ client_id: string; provider: string; status: string; error?: string }> = [];

    for (const conn of connections) {
      try {
        // Check token expiry — refresh if within 10 minutes of expiry
        const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
        const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

        let accessToken = conn.access_token;

        if (expiresAt && expiresAt < tenMinutesFromNow) {
          accessToken = await refreshToken(supabase, conn);
          if (!accessToken) {
            await supabase
              .from("wearable_connections")
              .update({ sync_status: "error", error_message: "Token refresh failed" })
              .eq("client_id", conn.client_id)
              .eq("provider", conn.provider);
            results.push({ client_id: conn.client_id, provider: conn.provider, status: "error", error: "Token refresh failed" });
            continue;
          }
        }

        // Call individual sync function
        const syncRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-wearable-steps`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              client_id: conn.client_id,
              provider: conn.provider,
              access_token: accessToken,
              start_date: startDate,
              end_date: today,
            }),
          }
        );

        const syncData = await syncRes.json();
        results.push({
          client_id: conn.client_id,
          provider: conn.provider,
          status: syncRes.ok ? "success" : "error",
          error: syncRes.ok ? undefined : syncData.error,
        });
      } catch (err: any) {
        results.push({
          client_id: conn.client_id,
          provider: conn.provider,
          status: "error",
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(`Batch sync complete: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({ success: true, synced: successCount, errors: errorCount, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Batch sync failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Token refresh helper
async function refreshToken(supabase: any, conn: any): Promise<string | null> {
  try {
    let refreshUrl = "";
    let body = "";

    if (conn.provider === "fitbit") {
      refreshUrl = "https://api.fitbit.com/oauth2/token";
      body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
        client_id: Deno.env.get("FITBIT_CLIENT_ID") || "",
        client_secret: Deno.env.get("FITBIT_CLIENT_SECRET") || "",
      }).toString();
    } else if (conn.provider === "google_fit") {
      refreshUrl = "https://oauth2.googleapis.com/token";
      body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      }).toString();
    }

    if (!refreshUrl) return null;

    const res = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabase
      .from("wearable_connections")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? conn.refresh_token,
        token_expires_at: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq("client_id", conn.client_id)
      .eq("provider", conn.provider);

    return data.access_token;
  } catch {
    return null;
  }
}
