import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

// Badge definitions with their check logic
const BADGE_CHECKS: Record<string, (profile: any, txType: string) => boolean> = {
  first_blood: (profile) => profile.total_xp > 0,
  "1k_club": (profile) => profile.total_xp >= 1000,
  "10k_club": (profile) => profile.total_xp >= 10000,
  in_momentum: (profile) => profile.current_streak >= 7,
  relentless: (profile) => profile.current_streak >= 14,
  locked_in: (profile) => profile.current_streak >= 30,
  tier_breaker: (profile) => {
    const tierOrder = ["bronze", "silver", "gold", "emerald", "diamond", "champion"];
    return tierOrder.indexOf(profile.current_tier) >= tierOrder.indexOf("gold");
  },
  summit: (profile) => {
    const tierOrder = ["bronze", "silver", "gold", "emerald", "diamond", "champion"];
    return tierOrder.indexOf(profile.current_tier) >= tierOrder.indexOf("diamond");
  },
  coachs_pick: (_profile, txType) => txType === "coach_award",
};

export async function checkAndAwardBadges(userId: string, profile: any, txType: string) {
  try {
    // Fetch all badges and user's existing badges in parallel
    const [{ data: allBadges }, { data: userBadges }] = await Promise.all([
      db.from("ranked_badges").select("id, name"),
      db.from("ranked_user_badges").select("badge_id").eq("user_id", userId),
    ]);

    if (!allBadges?.length) return;

    const earnedIds = new Set((userBadges || []).map((b: any) => b.badge_id));
    const newBadges: string[] = [];

    for (const badge of allBadges) {
      if (earnedIds.has(badge.id)) continue;
      const check = BADGE_CHECKS[badge.name];
      if (check && check(profile, txType)) {
        newBadges.push(badge.id);
      }
    }

    if (newBadges.length > 0) {
      const rows = newBadges.map((bid) => ({ user_id: userId, badge_id: bid }));
      await db.from("ranked_user_badges").insert(rows);
    }

    return newBadges.length;
  } catch (e) {
    console.error("[Ranked] Badge check error:", e);
    return 0;
  }
}
