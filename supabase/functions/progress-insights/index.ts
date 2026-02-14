import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Fetch recent data
    const [weightRes, measureRes, checkinRes] = await Promise.all([
      supabase
        .from("weight_logs")
        .select("weight, logged_at")
        .eq("client_id", user.id)
        .order("logged_at", { ascending: false })
        .limit(30),
      supabase
        .from("body_measurements")
        .select("body_fat_pct, waist, chest, hips, left_arm, right_arm, left_thigh, right_thigh, measured_at")
        .eq("client_id", user.id)
        .order("measured_at", { ascending: false })
        .limit(15),
      supabase
        .from("weekly_checkins")
        .select("energy_level, sleep_quality, mood, stress_level, week_date")
        .eq("client_id", user.id)
        .order("week_date", { ascending: false })
        .limit(8),
    ]);

    const weights = weightRes.data || [];
    const measurements = measureRes.data || [];
    const checkins = checkinRes.data || [];

    if (weights.length === 0 && measurements.length === 0) {
      return new Response(
        JSON.stringify({ insights: "Not enough data yet. Log some weights and measurements to get AI-powered insights!" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a summary for AI
    const summary = [];
    if (weights.length >= 2) {
      const latest = weights[0].weight;
      const oldest = weights[weights.length - 1].weight;
      const change = (latest - oldest).toFixed(1);
      summary.push(`Weight trend: ${oldest}→${latest} (${change > "0" ? "+" : ""}${change}) over ${weights.length} entries from ${weights[weights.length - 1].logged_at} to ${weights[0].logged_at}.`);
    }

    if (measurements.length >= 2) {
      const latest = measurements[0];
      const oldest = measurements[measurements.length - 1];
      if (latest.body_fat_pct && oldest.body_fat_pct) {
        const bfChange = (latest.body_fat_pct - oldest.body_fat_pct).toFixed(1);
        summary.push(`Body fat: ${oldest.body_fat_pct}%→${latest.body_fat_pct}% (${bfChange > "0" ? "+" : ""}${bfChange}%).`);
      }
      if (latest.waist && oldest.waist) {
        summary.push(`Waist: ${oldest.waist}→${latest.waist} cm.`);
      }
    }

    if (checkins.length > 0) {
      const avgEnergy = checkins.filter(c => c.energy_level).reduce((s, c) => s + c.energy_level, 0) / checkins.filter(c => c.energy_level).length;
      const avgSleep = checkins.filter(c => c.sleep_quality).reduce((s, c) => s + c.sleep_quality, 0) / checkins.filter(c => c.sleep_quality).length;
      summary.push(`Recent biofeedback avg: energy ${avgEnergy.toFixed(1)}/10, sleep quality ${avgSleep.toFixed(1)}/10.`);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a fitness coach AI analyzing a client's progress data. Provide 3-5 concise, actionable insights based on their trends. Be encouraging but honest. Use bullet points. Focus on: rate of change, consistency patterns, and actionable suggestions. Keep total response under 200 words. Do not use markdown headers, just bullet points.",
          },
          {
            role: "user",
            content: `Here is my recent progress data:\n${summary.join("\n")}\n\nProvide insights on my progress.`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted, please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const insights = aiData.choices?.[0]?.message?.content || "Unable to generate insights.";

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("progress-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
