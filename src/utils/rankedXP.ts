import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

// ── Tier Configuration ──────────────────────────────────────────
export const TIER_CONFIG = {
  bronze:   { name: "Bronze",   xpPerDiv: 100, color: "#CD7F32", order: 0 },
  silver:   { name: "Silver",   xpPerDiv: 150, color: "#C0C0C0", order: 1 },
  gold:     { name: "Gold",     xpPerDiv: 200, color: "#FFD700", order: 2 },
  emerald:  { name: "Emerald",  xpPerDiv: 300, color: "#50C878", order: 3 },
  diamond:  { name: "Diamond",  xpPerDiv: 400, color: "#00D4FF", order: 4 },
  champion: { name: "Champion", xpPerDiv: 0,   color: "#FF0000", order: 5 },
} as const;

export type TierName = keyof typeof TIER_CONFIG;
export const TIER_ORDER: TierName[] = ["bronze", "silver", "gold", "emerald", "diamond", "champion"];

const DIVISION_LABELS = ["V", "IV", "III", "II", "I"];

// Cumulative XP to ENTER each tier
// Bronze:0  Silver:500  Gold:1250  Emerald:2250  Diamond:3750  Champion:5750
export const TIER_FLOOR: Record<string, number> = {};
let _cum = 0;
for (const t of TIER_ORDER) {
  TIER_FLOOR[t] = _cum;
  if (t !== "champion") _cum += TIER_CONFIG[t].xpPerDiv * 5;
}

export const XP_VALUES = {
  workout_completed: 5,
  cardio_completed: 3,
  calories_on_target: 7,
  protein_on_target: 1,
  carbs_on_target: 1,
  fats_on_target: 1,
  checkin_submitted: 20,
  streak_bonus_7: 25,
  missed_workout: -4,
  missed_cardio: -2,
  no_nutrition: -5,
  calories_off_300: -5,
  missed_checkin: -15,
  decay_per_day: -30,
} as const;

// ── Placement Series Configuration ─────────────────────────────
export const PLACEMENT_DURATION_DAYS = 7;
export const PLACEMENT_MAX_XP = 1650; // Gold III

// Score (0–100) → Starting XP
export const PLACEMENT_XP_MAP: Array<{ minScore: number; xp: number; label: string }> = [
  { minScore: 95, xp: 1650, label: "Gold III" },
  { minScore: 90, xp: 1250, label: "Gold V" },
  { minScore: 80, xp: 1100, label: "Silver I" },
  { minScore: 65, xp: 800,  label: "Silver III" },
  { minScore: 50, xp: 500,  label: "Silver V" },
  { minScore: 30, xp: 200,  label: "Bronze III" },
  { minScore: 0,  xp: 0,    label: "Bronze V" },
];

export function getPlacementXP(score: number): { xp: number; label: string } {
  for (const tier of PLACEMENT_XP_MAP) {
    if (score >= tier.minScore) return { xp: tier.xp, label: tier.label };
  }
  return { xp: 0, label: "Bronze V" };
}

/**
 * Calculate placement score from 7-day compliance data.
 * Each pillar scores 0–100%. If a pillar has no scheduled events,
 * its weight redistributes to the other pillars.
 */
export function calculatePlacementScore(data: {
  workoutsCompleted: number;
  workoutsScheduled: number;
  nutritionDaysOnTarget: number;
  nutritionDaysWithTargets: number;
  cardioCompleted: number;
  cardioScheduled: number;
}): { workoutPct: number; nutritionPct: number; cardioPct: number; overall: number } {
  const workoutPct = data.workoutsScheduled > 0
    ? Math.min(100, (data.workoutsCompleted / data.workoutsScheduled) * 100)
    : -1; // -1 means "no data, redistribute"
  const nutritionPct = data.nutritionDaysWithTargets > 0
    ? Math.min(100, (data.nutritionDaysOnTarget / data.nutritionDaysWithTargets) * 100)
    : -1;
  const cardioPct = data.cardioScheduled > 0
    ? Math.min(100, (data.cardioCompleted / data.cardioScheduled) * 100)
    : -1;

  // Default weights
  const weights = { workout: 0.4, nutrition: 0.4, cardio: 0.2 };
  const pillars = [
    { pct: workoutPct, key: "workout" as const },
    { pct: nutritionPct, key: "nutrition" as const },
    { pct: cardioPct, key: "cardio" as const },
  ];

  const active = pillars.filter((p) => p.pct >= 0);
  if (active.length === 0) return { workoutPct: 0, nutritionPct: 0, cardioPct: 0, overall: 50 };

  const totalWeight = active.reduce((s, p) => s + weights[p.key], 0);
  const overall = active.reduce((s, p) => s + (p.pct * weights[p.key]) / totalWeight, 0);

  return {
    workoutPct: Math.max(0, workoutPct),
    nutritionPct: Math.max(0, nutritionPct),
    cardioPct: Math.max(0, cardioPct),
    overall: Math.round(overall * 100) / 100,
  };
}

export const COACH_PRESETS = {
  pr_hit:           { xp: 20, label: "PR Hit",         icon: "Trophy" },
  perfect_week:     { xp: 50, label: "Perfect Week",   icon: "Star" },
  consistency:      { xp: 20, label: "Consistency",    icon: "Link" },
  above_and_beyond: { xp: 50, label: "Above & Beyond", icon: "Rocket" },
} as const;

// ── Tier Calculation ────────────────────────────────────────────
export function calculateTierAndDivision(totalXP: number) {
  const xp = Math.max(0, totalXP);
  let remaining = xp;

  for (const tier of TIER_ORDER) {
    if (tier === "champion") {
      return { tier, division: 0, divisionXP: 0, xpNeeded: 0 };
    }
    const perDiv = TIER_CONFIG[tier].xpPerDiv;
    const tierTotal = perDiv * 5;
    if (remaining < tierTotal) {
      const divIndex = Math.min(4, Math.floor(remaining / perDiv));
      const division = 5 - divIndex; // V=5 … I=1
      const divisionXP = remaining - divIndex * perDiv;
      return { tier, division, divisionXP, xpNeeded: perDiv };
    }
    remaining -= tierTotal;
  }
  return { tier: "champion" as TierName, division: 0, divisionXP: 0, xpNeeded: 0 };
}

export function getDivisionLabel(tier: string, division: number) {
  if (tier === "champion") return "CHAMPION";
  const name = TIER_CONFIG[tier as TierName]?.name ?? tier;
  return `${name.toUpperCase()} ${DIVISION_LABELS[5 - division] ?? "V"}`;
}

export function getTierColor(tier: string) {
  return TIER_CONFIG[tier as TierName]?.color ?? "#CD7F32";
}

// ── Multiplier ──────────────────────────────────────────────────
export function getMultiplier(streak: number, isBoost: boolean, boostExpires: string | null) {
  let m = streak >= 30 ? 1.5 : streak >= 7 ? 1.25 : 1.0;
  if (isBoost && boostExpires && new Date(boostExpires) > new Date()) m *= 1.5;
  return Math.round(m * 100) / 100;
}

// ── Profile Helpers ─────────────────────────────────────────────
export async function ensureRankedProfile(userId: string) {
  const { data } = await db.from("ranked_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db
    .from("ranked_profiles")
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) {
    console.error("[Ranked] profile create:", error);
    return null;
  }
  return created;
}

function getLastMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// ── Award XP ────────────────────────────────────────────────────
export async function awardXP(
  userId: string,
  txType: string,
  baseAmount: number,
  description: string,
  opts?: {
    relatedEventId?: string;
    coachId?: string;
    coachPreset?: string;
    coachNote?: string;
  }
) {
  try {
    const profile = await ensureRankedProfile(userId);
    if (!profile) return null;

    const mult =
      baseAmount > 0
        ? getMultiplier(
            profile.current_streak,
            profile.is_new_client_boost,
            profile.new_client_boost_expires
          )
        : 1.0;
    const finalAmt = baseAmount > 0 ? Math.ceil(baseAmount * mult) : baseAmount;

    // Insert transaction
    const { error: txErr } = await db.from("xp_transactions").insert({
      user_id: userId,
      xp_amount: finalAmt,
      base_amount: baseAmount,
      multiplier: mult,
      transaction_type: txType,
      description,
      related_event_id: opts?.relatedEventId ?? null,
      coach_id: opts?.coachId ?? null,
      coach_award_preset: opts?.coachPreset ?? null,
      coach_note: opts?.coachNote ?? null,
    });
    if (txErr) {
      console.error("[Ranked] xp_transaction insert:", txErr);
      return null;
    }

    // Calculate new totals
    const newTotal = Math.max(0, profile.total_xp + finalAmt);
    const calc = calculateTierAndDivision(newTotal);

    // Demotion shield: can't fall below current tier unless inactive >= 7d
    let finalTier = calc.tier;
    let finalDiv = calc.division;
    let finalDivXP = calc.divisionXP;

    if (finalAmt < 0 && profile.inactive_days < 7) {
      const oldOrder = TIER_ORDER.indexOf(profile.current_tier);
      const newOrder = TIER_ORDER.indexOf(calc.tier as TierName);
      if (newOrder < oldOrder) {
        finalTier = profile.current_tier;
        finalDiv = 5;
        finalDivXP = 0;
      }
    }

    // Weekly XP tracking
    const lastMonday = getLastMonday();
    const resetAt = profile.weekly_xp_reset_at
      ? new Date(profile.weekly_xp_reset_at)
      : new Date(0);
    let weeklyXP = resetAt < lastMonday ? 0 : profile.weekly_xp || 0;
    if (finalAmt > 0) weeklyXP += finalAmt;

    // Rank change detection
    const oldTier = profile.current_tier;
    const oldDiv = profile.current_division;
    let rankChange = "none";
    const oti = TIER_ORDER.indexOf(oldTier);
    const nti = TIER_ORDER.indexOf(finalTier as TierName);

    if (nti > oti) rankChange = finalTier === "champion" ? "champion_in" : "tier_up";
    else if (nti < oti) rankChange = "tier_down";
    else if (finalDiv < oldDiv && finalAmt > 0) rankChange = "division_up";
    else if (finalDiv > oldDiv && finalAmt < 0) rankChange = "division_down";

    const updates: any = {
      total_xp: newTotal,
      current_tier: finalTier,
      current_division: finalTier === "champion" ? null : finalDiv,
      current_division_xp: finalDivXP,
      weekly_xp: weeklyXP,
      weekly_xp_reset_at:
        resetAt < lastMonday
          ? lastMonday.toISOString()
          : profile.weekly_xp_reset_at,
      updated_at: new Date().toISOString(),
    };

    if (
      rankChange === "division_up" ||
      rankChange === "tier_up" ||
      rankChange === "champion_in"
    ) {
      updates.last_rank_up_at = new Date().toISOString();
    }

    // Write pending rank event so client sees it on next login if offline
    if (rankChange !== "none") {
      const pendingEvent = {
        type: rankChange,
        tier: finalTier,
        division: finalDiv,
        previousTier: oldTier,
        timestamp: new Date().toISOString(),
      };
      // Append to existing pending events
      const existingPending = profile.pending_rank_event;
      if (Array.isArray(existingPending)) {
        updates.pending_rank_event = [...existingPending, pendingEvent];
      } else if (existingPending && typeof existingPending === "object") {
        updates.pending_rank_event = [existingPending, pendingEvent];
      } else {
        updates.pending_rank_event = [pendingEvent];
      }
    }

    await db
      .from("ranked_profiles")
      .update(updates)
      .eq("user_id", userId);

    return {
      xpAwarded: finalAmt,
      multiplier: mult,
      newTotal,
      tier: finalTier,
      division: finalDiv,
      divisionXP: finalDivXP,
      xpNeeded: calc.xpNeeded,
      rankChange,
      previousTier: oldTier,
    };
  } catch (e) {
    console.error("[Ranked] awardXP:", e);
    return null;
  }
}
