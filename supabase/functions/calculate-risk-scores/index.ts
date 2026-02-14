import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SignalWeights {
  noLogin: number;
  noEngagement: number;
  streakBroken: number;
  missedCheckin: number;
  workoutDecline: number;
  nutritionDecline: number;
}

const WEIGHTS: SignalWeights = {
  noLogin: 15,
  noEngagement: 20,
  streakBroken: 15,
  missedCheckin: 15,
  workoutDecline: 15,
  nutritionDecline: 10,
};

function getRiskLevel(score: number): string {
  if (score <= 30) return "low";
  if (score <= 60) return "moderate";
  if (score <= 80) return "high";
  return "critical";
}

function generateNudgeMessage(
  riskLevel: string,
  signals: Record<string, unknown>,
  name: string
): string {
  const firstName = name?.split(" ")[0] || "there";

  if (riskLevel === "moderate") {
    if (signals.streakBroken)
      return `${firstName}, you've built strong streaks before. A quick 10-minute session today could restart that momentum.`;
    if (signals.noEngagement)
      return `${firstName}, logging even one small win today keeps your progress moving forward.`;
    return `${firstName}, consistency compounds. Even a brief check-in today keeps the trajectory going.`;
  }

  if (riskLevel === "high") {
    return `${firstName}, setbacks are part of the process. Your coach has a simplified action plan ready whenever you're set to refocus.`;
  }

  if (riskLevel === "critical") {
    return `${firstName}, your progress isn't lost. One micro-action today can shift everything. Your coach is standing by to help you reset with intention.`;
  }

  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const threeDaysAgo = new Date(today.getTime() - 3 * 86400000)
      .toISOString()
      .split("T")[0];
    const fiveDaysAgo = new Date(today.getTime() - 5 * 86400000)
      .toISOString()
      .split("T")[0];
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)
      .toISOString()
      .split("T")[0];
    const fourteenDaysAgo = new Date(today.getTime() - 14 * 86400000)
      .toISOString()
      .split("T")[0];

    // Get all clients
    const { data: clientRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "client");

    if (!clientRoles || clientRoles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No clients found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientIds = clientRoles.map((r: { user_id: string }) => r.user_id);

    // Fetch profiles for names
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", clientIds);

    const profileMap = new Map(
      (profiles || []).map((p: { user_id: string; full_name: string | null }) => [
        p.user_id,
        p.full_name || "User",
      ])
    );

    const results: { userId: string; score: number; level: string }[] = [];

    for (const clientId of clientIds) {
      let score = 0;
      const signals: Record<string, unknown> = {};

      // 1. Check workout sessions in last 3 days (no login proxy)
      const { count: recentSessions } = await supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${threeDaysAgo}T00:00:00`);

      // Check nutrition logs in last 3 days
      const { count: recentNutLogs } = await supabase
        .from("nutrition_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${threeDaysAgo}T00:00:00`);

      if ((recentSessions || 0) === 0 && (recentNutLogs || 0) === 0) {
        score += WEIGHTS.noLogin;
        signals.noLogin = true;
      }

      // 2. No engagement in 5 days (workouts + nutrition + checkins)
      const { count: fiveDaySessions } = await supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${fiveDaysAgo}T00:00:00`);

      const { count: fiveDayNut } = await supabase
        .from("nutrition_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${fiveDaysAgo}T00:00:00`);

      const { count: fiveDayCheckins } = await supabase
        .from("weekly_checkins")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${fiveDaysAgo}T00:00:00`);

      if (
        (fiveDaySessions || 0) + (fiveDayNut || 0) + (fiveDayCheckins || 0) ===
        0
      ) {
        score += WEIGHTS.noEngagement;
        signals.noEngagement = true;
      }

      // 3. Streak broken: check if there's a gap in daily workout/nutrition logging
      const { data: last7Sessions } = await supabase
        .from("workout_sessions")
        .select("created_at")
        .eq("client_id", clientId)
        .gte("created_at", `${sevenDaysAgo}T00:00:00`)
        .order("created_at", { ascending: false });

      const { data: last7Nut } = await supabase
        .from("nutrition_logs")
        .select("created_at")
        .eq("client_id", clientId)
        .gte("created_at", `${sevenDaysAgo}T00:00:00`)
        .order("created_at", { ascending: false });

      const activeDays = new Set<string>();
      [...(last7Sessions || []), ...(last7Nut || [])].forEach(
        (r: { created_at: string }) => {
          activeDays.add(r.created_at.split("T")[0]);
        }
      );

      // Check for 2+ consecutive missed days in last 7
      let maxGap = 0;
      let currentGap = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() - i * 86400000)
          .toISOString()
          .split("T")[0];
        if (!activeDays.has(d)) {
          currentGap++;
          maxGap = Math.max(maxGap, currentGap);
        } else {
          currentGap = 0;
        }
      }

      if (maxGap >= 2) {
        score += WEIGHTS.streakBroken;
        signals.streakBroken = true;
        signals.gapDays = maxGap;
      }

      // 4. Missed weekly check-in (none in last 7 days)
      const { count: weeklyCheckins } = await supabase
        .from("weekly_checkins")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${sevenDaysAgo}T00:00:00`);

      if ((weeklyCheckins || 0) === 0) {
        score += WEIGHTS.missedCheckin;
        signals.missedCheckin = true;
      }

      // 5. Workout decline: compare last 7 days vs prior 7 days
      const { count: currentWeekWorkouts } = await supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${sevenDaysAgo}T00:00:00`);

      const { count: priorWeekWorkouts } = await supabase
        .from("workout_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${fourteenDaysAgo}T00:00:00`)
        .lt("created_at", `${sevenDaysAgo}T00:00:00`);

      if (
        (priorWeekWorkouts || 0) > 0 &&
        (currentWeekWorkouts || 0) < (priorWeekWorkouts || 0) * 0.5
      ) {
        score += WEIGHTS.workoutDecline;
        signals.workoutDecline = true;
        signals.currentWeekWorkouts = currentWeekWorkouts || 0;
        signals.priorWeekWorkouts = priorWeekWorkouts || 0;
      }

      // 6. Nutrition logging decline
      const { count: currentWeekNut } = await supabase
        .from("nutrition_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${sevenDaysAgo}T00:00:00`);

      const { count: priorWeekNut } = await supabase
        .from("nutrition_logs")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .gte("created_at", `${fourteenDaysAgo}T00:00:00`)
        .lt("created_at", `${sevenDaysAgo}T00:00:00`);

      if (
        (priorWeekNut || 0) > 0 &&
        (currentWeekNut || 0) < (priorWeekNut || 0) * 0.5
      ) {
        score += WEIGHTS.nutritionDecline;
        signals.nutritionDecline = true;
      }

      // Cap at 100
      score = Math.min(100, score);
      const riskLevel = getRiskLevel(score);

      // Upsert risk score
      await supabase.from("client_risk_scores").upsert(
        {
          client_id: clientId,
          score,
          risk_level: riskLevel,
          signals,
          calculated_at: todayStr,
        },
        { onConflict: "client_id,calculated_at" }
      );

      // Auto-generate nudge for moderate+ risk if none sent today
      if (riskLevel !== "low") {
        const { count: nudgesToday } = await supabase
          .from("retention_nudges")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("sent_at", `${todayStr}T00:00:00`);

        if ((nudgesToday || 0) === 0) {
          const name = profileMap.get(clientId) || "User";
          const message = generateNudgeMessage(riskLevel, signals, name);
          if (message) {
            await supabase.from("retention_nudges").insert({
              client_id: clientId,
              nudge_type:
                riskLevel === "moderate"
                  ? "motivational"
                  : riskLevel === "high"
                  ? "intervention"
                  : "critical_outreach",
              risk_level_at_send: riskLevel,
              message,
            });
          }
        }
      }

      results.push({ userId: clientId, score, level: riskLevel });
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} clients`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
