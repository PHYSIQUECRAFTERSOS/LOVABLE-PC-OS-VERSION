import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRIORITY: Record<string, number> = {
  apple_health: 100,
  fitbit: 80,
  google_fit: 60,
  manual: 40,
};

interface SleepNight {
  date: string;
  total_minutes: number;
  in_bed_minutes?: number;
  asleep_minutes?: number;
  deep_minutes?: number;
  rem_minutes?: number;
  light_minutes?: number;
  awake_minutes?: number;
  bedtime_at?: string | null;
  wake_at?: string | null;
}

async function refreshFitbitToken(refreshToken: string, clientId: string, clientSecret: string) {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
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

    const body = await req.json();
    const { client_id, provider, start_date, end_date } = body;
    let { access_token } = body;

    if (!client_id || !provider || !start_date || !end_date) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn } = await supabase
      .from("wearable_connections")
      .select("access_token, refresh_token, token_expires_at")
      .eq("client_id", client_id)
      .eq("provider", provider)
      .maybeSingle();

    if (conn) {
      if (!access_token) access_token = conn.access_token;
      if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date() && conn.refresh_token) {
        let refreshed;
        if (provider === "fitbit") {
          const cId = Deno.env.get("FITBIT_CLIENT_ID");
          const cSecret = Deno.env.get("FITBIT_CLIENT_SECRET");
          if (cId && cSecret) refreshed = await refreshFitbitToken(conn.refresh_token, cId, cSecret);
        } else if (provider === "google_fit") {
          const cId = Deno.env.get("GOOGLE_FIT_CLIENT_ID");
          const cSecret = Deno.env.get("GOOGLE_FIT_CLIENT_SECRET");
          if (cId && cSecret) refreshed = await refreshGoogleToken(conn.refresh_token, cId, cSecret);
        }
        if (refreshed?.access_token) {
          access_token = refreshed.access_token;
          const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
          await supabase
            .from("wearable_connections")
            .update({
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token || conn.refresh_token,
              token_expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("client_id", client_id)
            .eq("provider", provider);
        }
      }
    }

    if (!access_token) {
      return new Response(JSON.stringify({ error: "No access token available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nights: SleepNight[] = [];

    if (provider === "fitbit") {
      // /1.2/user/-/sleep/date/{startDate}/{endDate}.json
      const res = await fetch(
        `https://api.fitbit.com/1.2/user/-/sleep/date/${start_date}/${end_date}.json`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      const data = await res.json();
      if (data.errors) {
        console.error("Fitbit sleep error:", data.errors);
        return new Response(JSON.stringify({ error: "Fitbit API error", details: data.errors }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      for (const log of data.sleep || []) {
        const dateOfSleep: string = log.dateOfSleep; // YYYY-MM-DD (wake date)
        const totalMin: number = log.minutesAsleep ?? Math.round((log.duration || 0) / 60000);
        const inBed: number = log.timeInBed ?? 0;
        const summary = log.levels?.summary || {};
        nights.push({
          date: dateOfSleep,
          total_minutes: totalMin,
          in_bed_minutes: inBed,
          asleep_minutes: log.minutesAsleep ?? totalMin,
          deep_minutes: summary.deep?.minutes ?? 0,
          rem_minutes: summary.rem?.minutes ?? 0,
          light_minutes: summary.light?.minutes ?? 0,
          awake_minutes: summary.wake?.minutes ?? log.minutesAwake ?? 0,
          bedtime_at: log.startTime || null,
          wake_at: log.endTime || null,
        });
      }
    } else if (provider === "google_fit") {
      // Google Fit sleep sessions
      const startMs = new Date(start_date).getTime();
      const endMs = new Date(new Date(end_date).getTime() + 86400000).getTime();
      const url = `https://www.googleapis.com/fitness/v1/users/me/sessions?activityType=72&startTime=${new Date(startMs).toISOString()}&endTime=${new Date(endMs).toISOString()}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
      const data = await res.json();
      if (data.error) {
        console.error("Google Fit sleep error:", data.error);
        return new Response(JSON.stringify({ error: "Google Fit API error", details: data.error }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Aggregate sessions by wake date
      const byDate = new Map<string, SleepNight>();
      for (const s of data.session || []) {
        const startTime = new Date(parseInt(s.startTimeMillis));
        const endTime = new Date(parseInt(s.endTimeMillis));
        const total = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        const dateKey = endTime.toISOString().split("T")[0];
        const existing = byDate.get(dateKey);
        if (existing) {
          existing.total_minutes += total;
          existing.asleep_minutes = (existing.asleep_minutes ?? 0) + total;
          if (!existing.bedtime_at || startTime.toISOString() < existing.bedtime_at) {
            existing.bedtime_at = startTime.toISOString();
          }
          if (!existing.wake_at || endTime.toISOString() > existing.wake_at) {
            existing.wake_at = endTime.toISOString();
          }
        } else {
          byDate.set(dateKey, {
            date: dateKey,
            total_minutes: total,
            asleep_minutes: total,
            bedtime_at: startTime.toISOString(),
            wake_at: endTime.toISOString(),
          });
        }
      }
      nights.push(...byDate.values());
    } else {
      return new Response(JSON.stringify({ error: "Unsupported provider" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert respecting source priority
    const newPriority = PRIORITY[provider] ?? 50;
    let written = 0;
    for (const n of nights) {
      // Check existing source priority
      const { data: existing } = await supabase
        .from("sleep_logs")
        .select("source_priority")
        .eq("client_id", client_id)
        .eq("sleep_date", n.date)
        .maybeSingle();
      if (existing && (existing.source_priority ?? 0) > newPriority) continue;

      const { error } = await supabase.from("sleep_logs").upsert(
        {
          client_id,
          sleep_date: n.date,
          total_minutes: n.total_minutes,
          in_bed_minutes: n.in_bed_minutes ?? null,
          asleep_minutes: n.asleep_minutes ?? n.total_minutes,
          deep_minutes: n.deep_minutes ?? null,
          rem_minutes: n.rem_minutes ?? null,
          light_minutes: n.light_minutes ?? null,
          awake_minutes: n.awake_minutes ?? null,
          bedtime_at: n.bedtime_at ?? null,
          wake_at: n.wake_at ?? null,
          source: provider,
          source_priority: newPriority,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "client_id,sleep_date" }
      );
      if (!error) written++;
    }

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
      JSON.stringify({ success: true, nights_synced: written }),
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
