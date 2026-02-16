import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate week_start (previous Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diff - 7); // Previous week
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    const currentWeekStart = new Date(now);
    currentWeekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    currentWeekStart.setHours(0, 0, 0, 0);
    const currentWeekStr = currentWeekStart.toISOString().split("T")[0];

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    // Get all clients
    const { data: clientRoles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const clientIds = (clientRoles || [])
      .filter((r: any) => r.role === "client")
      .map((r: any) => r.user_id);

    if (!clientIds.length) {
      return new Response(JSON.stringify({ message: "No clients found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const userId of clientIds) {
      // --- Calculate workout compliance ---
      const { data: sessions } = await supabase
        .from("workout_sessions")
        .select("id, completed")
        .eq("client_id", userId)
        .gte("started_at", weekStartStr)
        .lt("started_at", weekEndStr);

      const totalWorkouts = (sessions || []).length;
      const completedWorkouts = (sessions || []).filter((s: any) => s.completed).length;
      const workoutPct = totalWorkouts > 0 ? Math.round((completedWorkouts / Math.max(totalWorkouts, 3)) * 100) : 0;

      // --- Calculate nutrition compliance ---
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("logged_at, calories, protein, carbs, fat")
        .eq("client_id", userId)
        .gte("logged_at", weekStartStr)
        .lt("logged_at", weekEndStr);

      const loggedDays = new Set((logs || []).map((l: any) => l.logged_at)).size;
      const nutritionPct = Math.round((Math.min(loggedDays, 7) / 7) * 100);

      // --- Check-in completed ---
      const { data: checkins } = await supabase
        .from("checkin_submissions")
        .select("id, status")
        .eq("client_id", userId)
        .gte("due_date", weekStartStr)
        .lt("due_date", weekEndStr)
        .eq("status", "submitted");

      const checkinCompleted = (checkins || []).length > 0;

      // --- Community posts ---
      const { data: posts } = await supabase
        .from("community_posts")
        .select("id, content")
        .eq("author_id", userId)
        .gte("created_at", weekStartStr + "T00:00:00Z")
        .lt("created_at", weekEndStr + "T00:00:00Z");

      const communityPostCount = (posts || []).length;

      // Total score (weighted)
      const totalScore = Math.round(
        workoutPct * 0.4 +
        nutritionPct * 0.35 +
        (checkinCompleted ? 100 : 0) * 0.15 +
        Math.min(communityPostCount * 20, 100) * 0.1
      );

      // Upsert weekly score
      await supabase.from("weekly_compliance_scores").upsert({
        user_id: userId,
        week_start: weekStartStr,
        workout_pct: workoutPct,
        nutrition_pct: nutritionPct,
        checkin_completed: checkinCompleted,
        community_post_count: communityPostCount,
        total_score: totalScore,
      }, { onConflict: "user_id,week_start" });

      // --- Get previous week score ---
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      const prevWeekStr = prevWeekStart.toISOString().split("T")[0];

      const { data: prevScore } = await supabase
        .from("weekly_compliance_scores")
        .select("total_score")
        .eq("user_id", userId)
        .eq("week_start", prevWeekStr)
        .maybeSingle();

      const prevTotal = prevScore?.total_score ?? null;

      // --- Get or create culture profile ---
      let { data: profile } = await supabase
        .from("culture_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profile) {
        await supabase.from("culture_profiles").insert({ user_id: userId });
        const { data: newProfile } = await supabase
          .from("culture_profiles")
          .select("*")
          .eq("user_id", userId)
          .single();
        profile = newProfile;
      }

      // --- Streak tracking ---
      let currentStreak = profile.current_streak || 0;
      let longestStreak = profile.longest_streak || 0;

      if (totalScore >= 70) {
        currentStreak += 1;
      } else {
        currentStreak = 0;
      }
      if (currentStreak > longestStreak) longestStreak = currentStreak;

      // --- Consistency Circle (≥70% for 4 consecutive weeks) ---
      let consistencyWeeks = profile.consistency_weeks || 0;
      let below70Weeks = profile.below_70_weeks || 0;
      let consistencyActive = profile.consistency_active || false;

      if (totalScore >= 70) {
        consistencyWeeks += 1;
        below70Weeks = 0;
      } else {
        below70Weeks += 1;
        if (below70Weeks >= 2) {
          consistencyActive = false;
          consistencyWeeks = 0;
        }
      }
      if (consistencyWeeks >= 4) consistencyActive = true;

      // --- Reset Week Eligibility (2 consecutive weeks below 60%) ---
      let below60Weeks = profile.below_60_weeks || 0;
      if (totalScore < 60) {
        below60Weeks += 1;
      } else {
        below60Weeks = 0;
      }
      const resetWeekEligible = below60Weeks >= 2;

      // --- Comeback Badge (prev < 50%, current ≥ 80%) ---
      let comebackCount = profile.comeback_count || 0;
      if (prevTotal !== null && prevTotal < 50 && totalScore >= 80) {
        comebackCount += 1;
        await supabase.from("culture_badges").upsert({
          user_id: userId,
          badge_type: "comeback",
          week_start: weekStartStr,
          metadata: { prev_score: prevTotal, current_score: totalScore },
        }, { onConflict: "user_id,badge_type,week_start" });
      }

      // --- Most Improved Badge (prev ≥ 50%, improved by ≥ 15%) ---
      let mostImprovedCount = profile.most_improved_count || 0;
      if (prevTotal !== null && prevTotal >= 50 && totalScore > prevTotal) {
        const improvement = ((totalScore - prevTotal) / prevTotal) * 100;
        if (improvement >= 15) {
          mostImprovedCount += 1;
          await supabase.from("culture_badges").upsert({
            user_id: userId,
            badge_type: "most_improved",
            week_start: weekStartStr,
            metadata: { prev_score: prevTotal, current_score: totalScore, improvement_pct: Math.round(improvement) },
          }, { onConflict: "user_id,badge_type,week_start" });
        }
      }

      // --- Elite Week (≥ 90% score) ---
      let totalEliteWeeks = profile.total_elite_weeks || 0;
      if (totalScore >= 90) {
        totalEliteWeeks += 1;
        await supabase.from("culture_badges").upsert({
          user_id: userId,
          badge_type: "elite_week",
          week_start: weekStartStr,
          metadata: { score: totalScore },
        }, { onConflict: "user_id,badge_type,week_start" });
      }

      // --- Tier calculation ---
      const { data: allScores } = await supabase
        .from("weekly_compliance_scores")
        .select("total_score")
        .eq("user_id", userId);

      const scores = (allScores || []).map((s: any) => s.total_score);
      const lifetimeAvg = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

      let tier = "bronze";
      if (lifetimeAvg >= 90 && totalEliteWeeks >= 8) tier = "elite";
      else if (lifetimeAvg >= 80 && totalEliteWeeks >= 4) tier = "gold";
      else if (lifetimeAvg >= 70) tier = "silver";

      // --- Update culture profile ---
      await supabase.from("culture_profiles").update({
        tier,
        total_elite_weeks: totalEliteWeeks,
        most_improved_count: mostImprovedCount,
        comeback_count: comebackCount,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        lifetime_avg: lifetimeAvg,
        consistency_active: consistencyActive,
        consistency_weeks: consistencyWeeks,
        below_70_weeks: below70Weeks,
        reset_week_eligible: resetWeekEligible,
        below_60_weeks: below60Weeks,
      }).eq("user_id", userId);

      results.push({ userId, totalScore, tier, currentStreak });
    }

    // --- Weekly Champion (top scorer) ---
    const { data: topScorer } = await supabase
      .from("weekly_compliance_scores")
      .select("user_id, total_score")
      .eq("week_start", weekStartStr)
      .order("total_score", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topScorer) {
      await supabase.from("culture_badges").upsert({
        user_id: topScorer.user_id,
        badge_type: "weekly_champion",
        week_start: weekStartStr,
        metadata: { score: topScorer.total_score },
      }, { onConflict: "user_id,badge_type,week_start" });
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, weekStart: weekStartStr }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
