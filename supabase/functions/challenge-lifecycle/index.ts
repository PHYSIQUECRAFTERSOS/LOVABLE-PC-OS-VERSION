const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split("T")[0];

    // ─────────────────────────────────────────────────────────────
    // 1. Transition upcoming → active
    // ─────────────────────────────────────────────────────────────
    const { data: toActivate } = await supabase
      .from("challenges")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("status", "upcoming")
      .lte("start_date", today)
      .select("id, title, start_date");

    // For each newly activated challenge: backfill today's scoring + notify participants
    for (const ch of (toActivate || [])) {
      // Fetch participants + rules once
      const [{ data: participants }, { data: rules }] = await Promise.all([
        supabase.from("challenge_participants").select("user_id").eq("challenge_id", ch.id),
        supabase.from("challenge_scoring_rules").select("*").eq("challenge_id", ch.id).eq("is_enabled", true),
      ]);

      const workoutRule = (rules || []).find((r: any) => r.action_type === "workout_completed");
      const nutritionRule = (rules || []).find((r: any) => r.action_type === "daily_logging");

      // Clear stale banner dismissals so the newly-active challenge re-surfaces
      const userIds = (participants || []).map((p: any) => p.user_id);
      if (userIds.length) {
        await supabase
          .from("challenge_banner_dismissals")
          .delete()
          .eq("challenge_id", ch.id)
          .in("user_id", userIds);
      }

      for (const p of (participants || [])) {
        // ── Backfill today's actions that happened since start_date 00:00 ──
        const startAt = `${ch.start_date}T00:00:00Z`;

        if (workoutRule) {
          const { count: workoutCount } = await supabase
            .from("workout_sessions")
            .select("*", { count: "exact", head: true })
            .eq("client_id", p.user_id)
            .eq("status", "completed")
            .gte("session_date", ch.start_date)
            .lte("session_date", today);
          if ((workoutCount || 0) > 0) {
            const toAward = Math.min(workoutCount as number, workoutRule.daily_cap);
            for (let i = 0; i < toAward; i++) {
              await supabase.from("challenge_logs").insert({
                challenge_id: ch.id,
                user_id: p.user_id,
                log_date: today,
                value: workoutRule.points,
                source: "auto_backfill",
                metadata: { action_type: "workout_completed" },
              });
            }
          }
        }

        if (nutritionRule) {
          const { data: nutLogs } = await supabase
            .from("nutrition_logs")
            .select("logged_at")
            .eq("client_id", p.user_id)
            .gte("logged_at", ch.start_date)
            .lte("logged_at", today);
          const distinctDays = new Set((nutLogs || []).map((l: any) => l.logged_at));
          const days = Math.min(distinctDays.size, nutritionRule.daily_cap);
          for (let i = 0; i < days; i++) {
            await supabase.from("challenge_logs").insert({
              challenge_id: ch.id,
              user_id: p.user_id,
              log_date: today,
              value: nutritionRule.points,
              source: "auto_backfill",
              metadata: { action_type: "daily_logging" },
            });
          }
        }

        // Recalculate current_value for this participant
        const { data: allLogs } = await supabase
          .from("challenge_logs")
          .select("value")
          .eq("challenge_id", ch.id)
          .eq("user_id", p.user_id);
        const total = (allLogs || []).reduce((s: number, l: any) => s + Number(l.value), 0);
        await supabase
          .from("challenge_participants")
          .update({ current_value: total, best_value: total })
          .eq("challenge_id", ch.id)
          .eq("user_id", p.user_id);

        // ── In-app thread notification (coach → client) ──
        const { data: thread } = await supabase
          .from("message_threads")
          .select("id, coach_id")
          .eq("client_id", p.user_id)
          .maybeSingle();
        if (thread?.id && thread?.coach_id) {
          await supabase.from("thread_messages").insert({
            thread_id: thread.id,
            sender_id: thread.coach_id,
            content: `🔥 The "${ch.title}" challenge is now LIVE! Tap the Challenges tab to see the leaderboard and start earning points.`,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Transition active → completed (award XP + badges)
    // ─────────────────────────────────────────────────────────────
    const { data: toComplete } = await supabase
      .from("challenges")
      .select("id, xp_reward, badge_id")
      .eq("status", "active")
      .lt("end_date", today);

    let completedCount = 0;
    for (const challenge of (toComplete || [])) {
      await supabase
        .from("challenges")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", challenge.id);

      const { data: participants } = await supabase
        .from("challenge_participants")
        .select("*")
        .eq("challenge_id", challenge.id)
        .eq("status", "active");

      for (const p of (participants || [])) {
        await supabase
          .from("challenge_participants")
          .update({ status: "completed", completed_at: new Date().toISOString(), xp_earned: challenge.xp_reward })
          .eq("id", p.id);

        await supabase.from("xp_ledger").insert({
          user_id: p.user_id,
          amount: challenge.xp_reward,
          source_type: "challenge",
          source_id: challenge.id,
          description: `Challenge completed`,
        });

        if (challenge.badge_id) {
          await supabase.from("user_badges").upsert({
            user_id: p.user_id,
            badge_id: challenge.badge_id,
            source_challenge_id: challenge.id,
          }, { onConflict: "user_id,badge_id" });
        }

        const { data: ledger } = await supabase
          .from("xp_ledger")
          .select("amount")
          .eq("user_id", p.user_id);
        const totalXP = (ledger || []).reduce((sum: number, l: any) => sum + l.amount, 0);

        const { data: tiers } = await supabase
          .from("tiers")
          .select("*")
          .order("min_xp", { ascending: false });
        const tier = (tiers || []).find((t: any) => totalXP >= t.min_xp);

        await supabase.from("user_xp_summary").upsert({
          user_id: p.user_id,
          total_xp: totalXP,
          current_tier_id: tier?.id || null,
        }, { onConflict: "user_id" });
      }
      completedCount++;
    }

    return new Response(
      JSON.stringify({
        activated: (toActivate || []).length,
        activated_ids: (toActivate || []).map((c: any) => c.id),
        completed: completedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
