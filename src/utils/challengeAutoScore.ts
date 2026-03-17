import { supabase } from "@/integrations/supabase/client";
import { getLocalDateString } from "@/utils/localDate";

const db = supabase as any;

export async function autoScoreChallengePoints(
  userId: string,
  actions: { type: string; count: number }[]
) {
  const today = getLocalDateString();

  // 1. Get active challenges where user is a participant
  const { data: activeChallenges } = await db
    .from("challenges")
    .select("id")
    .eq("status", "active");
  if (!activeChallenges?.length) return;

  const challengeIds = activeChallenges.map((c: any) => c.id);

  const { data: myParticipations } = await db
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", userId)
    .in("challenge_id", challengeIds);
  if (!myParticipations?.length) return;

  const myChallengeIds = myParticipations.map((p: any) => p.challenge_id);

  // 2. For each challenge, get scoring rules
  const { data: allRules } = await db
    .from("challenge_scoring_rules")
    .select("*")
    .in("challenge_id", myChallengeIds)
    .eq("is_enabled", true);
  if (!allRules?.length) return;

  // 3. Get today's existing logs for this user across these challenges
  const { data: todayLogs } = await db
    .from("challenge_logs")
    .select("challenge_id, metadata")
    .eq("user_id", userId)
    .eq("log_date", today)
    .in("challenge_id", myChallengeIds);

  const todayLogsByChallenge: Record<string, any[]> = {};
  (todayLogs || []).forEach((l: any) => {
    if (!todayLogsByChallenge[l.challenge_id]) todayLogsByChallenge[l.challenge_id] = [];
    todayLogsByChallenge[l.challenge_id].push(l);
  });

  // 4. For each challenge, award points per action type
  for (const challengeId of myChallengeIds) {
    const rules = allRules.filter((r: any) => r.challenge_id === challengeId);
    const existingLogs = todayLogsByChallenge[challengeId] || [];

    for (const action of actions) {
      const rule = rules.find((r: any) => r.action_type === action.type);
      if (!rule) continue;

      const existingCount = existingLogs.filter(
        (l: any) => l.metadata?.action_type === action.type
      ).length;

      const remaining = Math.max(0, rule.daily_cap - existingCount);
      const toAward = Math.min(action.count, remaining);

      if (toAward <= 0) continue;

      for (let i = 0; i < toAward; i++) {
        const { error } = await db.from("challenge_logs").insert({
          challenge_id: challengeId,
          user_id: userId,
          log_date: today,
          value: rule.points,
          source: "auto",
          metadata: { action_type: action.type },
        });
        if (error) console.error("[autoScore] Log insert error:", error);
      }
    }

    // 5. Recalculate current_value for this challenge
    const { data: allLogs } = await db
      .from("challenge_logs")
      .select("value")
      .eq("challenge_id", challengeId)
      .eq("user_id", userId);
    const totalPoints = (allLogs || []).reduce((sum: number, l: any) => sum + Number(l.value), 0);

    await db
      .from("challenge_participants")
      .update({ current_value: totalPoints, best_value: totalPoints })
      .eq("challenge_id", challengeId)
      .eq("user_id", userId);
  }
}
