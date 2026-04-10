import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Tier config (mirrored from rankedXP.ts) ─────────────────────
const TIER_CONFIG: Record<string, { xpPerDiv: number; order: number }> = {
  bronze:   { xpPerDiv: 100, order: 0 },
  silver:   { xpPerDiv: 150, order: 1 },
  gold:     { xpPerDiv: 200, order: 2 },
  emerald:  { xpPerDiv: 300, order: 3 },
  diamond:  { xpPerDiv: 400, order: 4 },
  champion: { xpPerDiv: 0,   order: 5 },
};
const TIER_ORDER = ["bronze", "silver", "gold", "emerald", "diamond", "champion"];

function calculateTierAndDivision(totalXP: number) {
  const xp = Math.max(0, totalXP);
  let remaining = xp;
  for (const tier of TIER_ORDER) {
    if (tier === "champion") return { tier, division: 0, divisionXP: 0, xpNeeded: 0 };
    const perDiv = TIER_CONFIG[tier].xpPerDiv;
    const tierTotal = perDiv * 5;
    if (remaining < tierTotal) {
      const divIndex = Math.min(4, Math.floor(remaining / perDiv));
      const division = 5 - divIndex;
      const divisionXP = remaining - divIndex * perDiv;
      return { tier, division, divisionXP, xpNeeded: perDiv };
    }
    remaining -= tierTotal;
  }
  return { tier: "champion", division: 0, divisionXP: 0, xpNeeded: 0 };
}

function getMultiplier(streak: number, isBoost: boolean, boostExpires: string | null) {
  let m = streak >= 30 ? 1.5 : streak >= 7 ? 1.25 : 1.0;
  if (isBoost && boostExpires && new Date(boostExpires) > new Date()) m *= 1.5;
  return Math.round(m * 100) / 100;
}

// ── Placement config ────────────────────────────────────────────
const PLACEMENT_DURATION_DAYS = 7;
const PLACEMENT_XP_MAP = [
  { minScore: 95, xp: 1650, label: "Gold III" },
  { minScore: 90, xp: 1250, label: "Gold V" },
  { minScore: 80, xp: 1100, label: "Silver I" },
  { minScore: 65, xp: 800,  label: "Silver III" },
  { minScore: 50, xp: 500,  label: "Silver V" },
  { minScore: 30, xp: 200,  label: "Bronze III" },
  { minScore: 0,  xp: 0,    label: "Bronze V" },
];

function getPlacementXP(score: number) {
  for (const tier of PLACEMENT_XP_MAP) {
    if (score >= tier.minScore) return tier;
  }
  return { xp: 0, label: "Bronze V", minScore: 0 };
}

// ── XP values ───────────────────────────────────────────────────
const XP = {
  calories_on_target: 7,
  protein_on_target: 1,
  carbs_on_target: 1,
  fats_on_target: 1,
  missed_workout: -4,
  missed_cardio: -2,
  no_nutrition: -5,
  calories_off_300: -5,
  missed_checkin: -15,
  decay_per_day: -30,
};

// Helper: build OR filter for user_id / target_client_id
function clientFilter(clientId: string) {
  return `user_id.eq.${clientId},target_client_id.eq.${clientId}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const evalDate = yesterday.toISOString().split("T")[0];

    console.log(`[daily-xp] Evaluating date: ${evalDate}`);

    const { data: activeClients } = await db
      .from("coach_clients")
      .select("client_id")
      .eq("status", "active");

    if (!activeClients || activeClients.length === 0) {
      return new Response(JSON.stringify({ message: "No active clients", date: evalDate }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientIds = [...new Set(activeClients.map((c: any) => c.client_id))];
    const results: any[] = [];

    for (const clientId of clientIds) {
      try {
        const clientResult = await evaluateClient(db, clientId, evalDate);
        results.push({ clientId, ...clientResult });
      } catch (e) {
        console.error(`[daily-xp] Error for ${clientId}:`, e);
        results.push({ clientId, error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({ date: evalDate, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[daily-xp] Fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Per-client evaluation ───────────────────────────────────────
async function evaluateClient(db: any, clientId: string, evalDate: string) {
  // 1. Check for duplicate processing
  const { data: existingTx } = await db
    .from("xp_transactions")
    .select("id")
    .eq("user_id", clientId)
    .eq("transaction_type", "daily_eval")
    .ilike("description", `%${evalDate}%`)
    .limit(1);

  if (existingTx && existingTx.length > 0) {
    return { skipped: true, reason: "already_processed" };
  }

  // 2. Ensure ranked profile exists
  let { data: profile } = await db
    .from("ranked_profiles")
    .select("*")
    .eq("user_id", clientId)
    .maybeSingle();

  if (!profile) {
    const { data: created } = await db
      .from("ranked_profiles")
      .insert({ user_id: clientId, placement_status: "pending", placement_days_completed: 0 })
      .select()
      .single();
    profile = created;
  }
  if (!profile) return { skipped: true, reason: "no_profile" };

  // ── PLACEMENT SERIES HANDLING ─────────────────────────────────
  const placementStatus = profile.placement_status || "completed";

  if (placementStatus === "pending" || placementStatus === "in_progress") {
    return await handlePlacementDay(db, clientId, evalDate, profile);
  }

  // ── Normal XP evaluation (placement_status = 'completed' or 'coach_override') ──
  return await normalEvaluation(db, clientId, evalDate, profile);
}

// ── Placement day handler ───────────────────────────────────────
async function handlePlacementDay(db: any, clientId: string, evalDate: string, profile: any) {
  const currentDay = (profile.placement_days_completed || 0) + 1;
  const startDate = profile.placement_start_date || evalDate;

  // Start placement if pending
  const updates: any = {
    placement_status: "in_progress",
    placement_days_completed: currentDay,
    updated_at: new Date().toISOString(),
  };
  if (!profile.placement_start_date) {
    updates.placement_start_date = evalDate;
  }

  // Insert a marker transaction (no XP awarded during placement)
  await db.from("xp_transactions").insert({
    user_id: clientId,
    xp_amount: 0,
    base_amount: 0,
    multiplier: 1,
    transaction_type: "daily_eval",
    description: `Placement day ${currentDay}/${PLACEMENT_DURATION_DAYS}: ${evalDate}`,
  });

  // If this is the final day, calculate placement score
  if (currentDay >= PLACEMENT_DURATION_DAYS) {
    const score = await calculatePlacementScore(db, clientId, startDate, evalDate);
    const placement = getPlacementXP(score.overall);
    const calc = calculateTierAndDivision(placement.xp);

    updates.placement_status = "completed";
    updates.placement_score = {
      workout_pct: score.workoutPct,
      nutrition_pct: score.nutritionPct,
      cardio_pct: score.cardioPct,
      overall: score.overall,
      final_xp: placement.xp,
      final_label: placement.label,
    };
    updates.total_xp = placement.xp;
    updates.current_tier = calc.tier;
    updates.current_division = calc.tier === "champion" ? null : calc.division;
    updates.current_division_xp = calc.divisionXP;

    // Write pending rank event for placement reveal
    updates.pending_rank_event = [{
      type: "placement_reveal",
      tier: calc.tier,
      division: calc.division,
      score: score.overall,
      label: placement.label,
      timestamp: new Date().toISOString(),
    }];

    // Insert placement result transaction
    await db.from("xp_transactions").insert({
      user_id: clientId,
      xp_amount: placement.xp,
      base_amount: placement.xp,
      multiplier: 1,
      transaction_type: "placement_result",
      description: `Placement complete: ${placement.label} (Score: ${Math.round(score.overall)}%)`,
    });

    console.log(`[daily-xp] Placement complete for ${clientId}: ${placement.label} (${Math.round(score.overall)}%) → ${placement.xp} XP`);
  }

  await db.from("ranked_profiles").update(updates).eq("user_id", clientId);

  return {
    skipped: false,
    placement: true,
    day: currentDay,
    completed: currentDay >= PLACEMENT_DURATION_DAYS,
    ...(updates.placement_score ? { placementScore: updates.placement_score } : {}),
  };
}

// ── Calculate placement score from 7-day window ─────────────────
async function calculatePlacementScore(db: any, clientId: string, startDate: string, endDate: string) {
  // Workouts: scheduled vs completed
  const { data: scheduledWorkouts } = await db
    .from("calendar_events")
    .select("id, linked_workout_id, is_completed")
    .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`)
    .eq("event_type", "workout")
    .gte("event_date", startDate)
    .lte("event_date", endDate);

  const { data: completedSessions } = await db
    .from("workout_sessions")
    .select("workout_id")
    .eq("client_id", clientId)
    .gte("session_date", startDate)
    .lte("session_date", endDate)
    .eq("status", "completed");

  const completedWorkoutIds = new Set((completedSessions || []).map((s: any) => s.workout_id));
  const workoutsScheduled = (scheduledWorkouts || []).length;
  const workoutsCompleted = (scheduledWorkouts || []).filter((w: any) =>
    w.is_completed || (w.linked_workout_id && completedWorkoutIds.has(w.linked_workout_id))
  ).length;

  // Cardio: scheduled vs completed
  const { data: scheduledCardio } = await db
    .from("calendar_events")
    .select("id, linked_cardio_id, is_completed")
    .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`)
    .eq("event_type", "cardio")
    .gte("event_date", startDate)
    .lte("event_date", endDate);

  const { data: completedCardioLogs } = await db
    .from("cardio_logs")
    .select("assignment_id")
    .eq("client_id", clientId)
    .gte("logged_at", startDate)
    .lte("logged_at", endDate)
    .eq("completed", true);

  const completedCardioIds = new Set((completedCardioLogs || []).filter((c: any) => c.assignment_id).map((c: any) => c.assignment_id));
  const cardioScheduled = (scheduledCardio || []).length;
  const cardioCompleted = (scheduledCardio || []).filter((c: any) =>
    c.is_completed || (c.linked_cardio_id && completedCardioIds.has(c.linked_cardio_id))
  ).length;

  // Nutrition: days with calories within ±150 of target
  // Build list of dates in range
  const dates: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }

  let nutritionDaysOnTarget = 0;
  let nutritionDaysWithTargets = 0;

  for (const date of dates) {
    const { data: target } = await db
      .from("nutrition_targets")
      .select("calories")
      .eq("client_id", clientId)
      .lte("effective_date", date)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!target) continue;
    nutritionDaysWithTargets++;

    const { data: logs } = await db
      .from("nutrition_logs")
      .select("calories")
      .eq("client_id", clientId)
      .eq("logged_at", date);

    if (!logs || logs.length === 0) continue;
    const totalCals = logs.reduce((s: number, l: any) => s + (l.calories || 0), 0);
    if (Math.abs(totalCals - target.calories) <= 150) {
      nutritionDaysOnTarget++;
    }
  }

  // Calculate weighted score
  const workoutPct = workoutsScheduled > 0 ? (workoutsCompleted / workoutsScheduled) * 100 : -1;
  const nutritionPct = nutritionDaysWithTargets > 0 ? (nutritionDaysOnTarget / nutritionDaysWithTargets) * 100 : -1;
  const cardioPct = cardioScheduled > 0 ? (cardioCompleted / cardioScheduled) * 100 : -1;

  const weights = { workout: 0.4, nutrition: 0.4, cardio: 0.2 };
  const pillars = [
    { pct: workoutPct, key: "workout" as const },
    { pct: nutritionPct, key: "nutrition" as const },
    { pct: cardioPct, key: "cardio" as const },
  ];
  const active = pillars.filter((p) => p.pct >= 0);
  if (active.length === 0) {
    return { workoutPct: 0, nutritionPct: 0, cardioPct: 0, overall: 50 };
  }
  const totalWeight = active.reduce((s, p) => s + weights[p.key], 0);
  const overall = active.reduce((s, p) => s + (p.pct * weights[p.key]) / totalWeight, 0);

  return {
    workoutPct: Math.max(0, Math.round(workoutPct * 100) / 100),
    nutritionPct: Math.max(0, Math.round(nutritionPct * 100) / 100),
    cardioPct: Math.max(0, Math.round(cardioPct * 100) / 100),
    overall: Math.round(overall * 100) / 100,
  };
}

// ── Normal XP evaluation (existing logic) ───────────────────────
async function normalEvaluation(db: any, clientId: string, evalDate: string, profile: any) {
  const txBatch: Array<{ txType: string; base: number; desc: string }> = [];

  // ── 3. Nutrition compliance ────────────────────────────────────
  const { data: nutritionLogs } = await db
    .from("nutrition_logs")
    .select("calories, protein, carbs, fat")
    .eq("client_id", clientId)
    .eq("logged_at", evalDate);

  const hasNutrition = nutritionLogs && nutritionLogs.length > 0;

  if (!hasNutrition) {
    txBatch.push({ txType: "no_nutrition", base: XP.no_nutrition, desc: `No nutrition logged: ${evalDate}` });
  } else {
    const totals = nutritionLogs.reduce(
      (acc: any, log: any) => ({
        calories: acc.calories + (log.calories || 0),
        protein: acc.protein + (log.protein || 0),
        carbs: acc.carbs + (log.carbs || 0),
        fat: acc.fat + (log.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const { data: target } = await db
      .from("nutrition_targets")
      .select("calories, protein, carbs, fat, rest_calories, rest_protein, rest_carbs, rest_fat")
      .eq("client_id", clientId)
      .lte("effective_date", evalDate)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (target) {
      // Day-type-aware target resolution: check if evalDate has a workout
      const { data: workoutEvents } = await db
        .from("calendar_events")
        .select("id")
        .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`)
        .eq("event_type", "workout")
        .eq("event_date", evalDate)
        .limit(1);

      const isRestDay = !workoutEvents || workoutEvents.length === 0;
      const effectiveCals = isRestDay && target.rest_calories != null ? target.rest_calories : target.calories;
      const effectiveProtein = isRestDay && target.rest_protein != null ? target.rest_protein : target.protein;
      const effectiveCarbs = isRestDay && target.rest_carbs != null ? target.rest_carbs : target.carbs;
      const effectiveFat = isRestDay && target.rest_fat != null ? target.rest_fat : target.fat;

      const calDiff = Math.abs(totals.calories - effectiveCals);
      if (calDiff <= 100) {
        txBatch.push({ txType: "calories_on_target", base: XP.calories_on_target, desc: `Calories on target (±${calDiff}): ${evalDate}` });
      } else if (calDiff >= 300) {
        txBatch.push({ txType: "calories_off_300", base: XP.calories_off_300, desc: `Calories off by ${calDiff}: ${evalDate}` });
      }
      if (Math.abs(totals.protein - effectiveProtein) <= 5) {
        txBatch.push({ txType: "protein_on_target", base: XP.protein_on_target, desc: `Protein on target: ${evalDate}` });
      }
      if (Math.abs(totals.carbs - effectiveCarbs) <= 5) {
        txBatch.push({ txType: "carbs_on_target", base: XP.carbs_on_target, desc: `Carbs on target: ${evalDate}` });
      }
      if (Math.abs(totals.fat - effectiveFat) <= 5) {
        txBatch.push({ txType: "fats_on_target", base: XP.fats_on_target, desc: `Fats on target: ${evalDate}` });
      }
    }
  }

  // ── 4. Pre-fetch completed workout sessions for cross-check ───
  const { data: completedSessions } = await db
    .from("workout_sessions")
    .select("workout_id")
    .eq("client_id", clientId)
    .eq("session_date", evalDate)
    .eq("status", "completed");

  const completedWorkoutIds = new Set(
    (completedSessions || []).map((s: any) => s.workout_id)
  );

  // ── 5. Pre-fetch completed cardio logs for cross-check ────────
  const { data: completedCardioLogs } = await db
    .from("cardio_logs")
    .select("assignment_id")
    .eq("client_id", clientId)
    .eq("logged_at", evalDate)
    .eq("completed", true);

  const completedCardioAssignmentIds = new Set(
    (completedCardioLogs || []).filter((c: any) => c.assignment_id).map((c: any) => c.assignment_id)
  );

  // ── 6. Missed workouts (with cross-check) ─────────────────────
  const { data: missedWorkouts } = await db
    .from("calendar_events")
    .select("id, linked_workout_id")
    .or(clientFilter(clientId))
    .eq("event_date", evalDate)
    .eq("event_type", "workout")
    .eq("is_completed", false);

  if (missedWorkouts && missedWorkouts.length > 0) {
    for (const w of missedWorkouts) {
      if (w.linked_workout_id && completedWorkoutIds.has(w.linked_workout_id)) {
        await db.from("calendar_events")
          .update({ is_completed: true, completed_at: `${evalDate}T23:59:59Z` })
          .eq("id", w.id);
        console.log(`[daily-xp] Auto-fixed calendar event ${w.id} — workout was completed`);
      } else {
        txBatch.push({ txType: "missed_workout", base: XP.missed_workout, desc: `Missed workout: ${evalDate}` });
      }
    }
  }

  // ── 7. Missed cardio (with cross-check) ───────────────────────
  const { data: missedCardio } = await db
    .from("calendar_events")
    .select("id, linked_cardio_id")
    .or(clientFilter(clientId))
    .eq("event_date", evalDate)
    .eq("event_type", "cardio")
    .eq("is_completed", false);

  if (missedCardio && missedCardio.length > 0) {
    for (const c of missedCardio) {
      if (c.linked_cardio_id && completedCardioAssignmentIds.has(c.linked_cardio_id)) {
        await db.from("calendar_events")
          .update({ is_completed: true, completed_at: `${evalDate}T23:59:59Z` })
          .eq("id", c.id);
        console.log(`[daily-xp] Auto-fixed calendar event ${c.id} — cardio was completed`);
      } else {
        txBatch.push({ txType: "missed_cardio", base: XP.missed_cardio, desc: `Missed cardio: ${evalDate}` });
      }
    }
  }

  // ── 8. Missed check-ins ───────────────────────────────────────
  const { data: missedCheckins } = await db
    .from("calendar_events")
    .select("id")
    .or(clientFilter(clientId))
    .eq("event_date", evalDate)
    .eq("event_type", "checkin")
    .eq("is_completed", false);

  if (missedCheckins && missedCheckins.length > 0) {
    for (const ci of missedCheckins) {
      txBatch.push({ txType: "missed_checkin", base: XP.missed_checkin, desc: `Missed check-in: ${evalDate}` });
    }
  }

  // ── 9. Determine activity for the day ─────────────────────────
  const { data: completedEvents } = await db
    .from("calendar_events")
    .select("id")
    .or(clientFilter(clientId))
    .eq("event_date", evalDate)
    .eq("is_completed", true)
    .limit(1);

  const wasActive = hasNutrition || (completedEvents && completedEvents.length > 0) || completedWorkoutIds.size > 0;

  // ── 10. Streak & inactivity ───────────────────────────────────
  let newStreak = profile.current_streak || 0;
  let newInactiveDays = profile.inactive_days || 0;
  let newLastActiveDate = profile.last_active_date;

  if (wasActive) {
    newStreak += 1;
    newInactiveDays = 0;
    newLastActiveDate = evalDate;
  } else {
    const { data: scheduledEvents } = await db
      .from("calendar_events")
      .select("id")
      .or(clientFilter(clientId))
      .eq("event_date", evalDate)
      .limit(1);

    const hadScheduledEvents = scheduledEvents && scheduledEvents.length > 0;

    if (hadScheduledEvents) {
      newStreak = 0;
      newInactiveDays += 1;
    }
  }

  // ── 11. Inactivity decay ──────────────────────────────────────
  if (newInactiveDays >= 7) {
    txBatch.push({ txType: "decay_per_day", base: XP.decay_per_day, desc: `Inactivity decay (${newInactiveDays} days): ${evalDate}` });
  }

  // ── 12. Process XP transactions ───────────────────────────────
  let totalXPChange = 0;

  for (const tx of txBatch) {
    const mult = tx.base > 0
      ? getMultiplier(profile.current_streak, profile.is_new_client_boost, profile.new_client_boost_expires)
      : 1.0;
    const finalAmt = tx.base > 0 ? Math.ceil(tx.base * mult) : tx.base;

    await db.from("xp_transactions").insert({
      user_id: clientId,
      xp_amount: finalAmt,
      base_amount: tx.base,
      multiplier: mult,
      transaction_type: tx.txType,
      description: tx.desc,
    });

    totalXPChange += finalAmt;
  }

  // Marker transaction for duplicate prevention
  if (txBatch.length > 0) {
    await db.from("xp_transactions").insert({
      user_id: clientId,
      xp_amount: 0,
      base_amount: 0,
      multiplier: 1,
      transaction_type: "daily_eval",
      description: `Daily evaluation: ${evalDate}`,
    });
  }

  // ── 13. Update ranked_profiles ────────────────────────────────
  const newTotal = Math.max(0, profile.total_xp + totalXPChange);
  const calc = calculateTierAndDivision(newTotal);

  let finalTier = calc.tier;
  let finalDiv = calc.division;
  let finalDivXP = calc.divisionXP;

  if (totalXPChange < 0 && newInactiveDays < 7) {
    const oldOrder = TIER_ORDER.indexOf(profile.current_tier);
    const newOrder = TIER_ORDER.indexOf(calc.tier);
    if (newOrder < oldOrder) {
      finalTier = profile.current_tier;
      finalDiv = 5;
      finalDivXP = 0;
    }
  }

  // ── 14. Rank change detection → pending event ─────────────────
  const oldTier = profile.current_tier;
  const oldDiv = profile.current_division;
  const oti = TIER_ORDER.indexOf(oldTier);
  const nti = TIER_ORDER.indexOf(finalTier);
  let rankChange = "none";

  if (nti > oti) rankChange = finalTier === "champion" ? "champion_in" : "tier_up";
  else if (nti < oti) rankChange = "tier_down";
  else if (finalDiv < oldDiv && totalXPChange > 0) rankChange = "division_up";
  else if (finalDiv > oldDiv && totalXPChange < 0) rankChange = "division_down";

  let pendingRankEvent = null;
  if (rankChange !== "none") {
    pendingRankEvent = {
      type: rankChange,
      tier: finalTier,
      division: finalDiv,
      previousTier: oldTier,
      timestamp: new Date().toISOString(),
    };
    console.log(`[daily-xp] Rank change for ${clientId}: ${rankChange} → ${finalTier} div ${finalDiv}`);
  }

  const lastMonday = getLastMonday();
  const resetAt = profile.weekly_xp_reset_at ? new Date(profile.weekly_xp_reset_at) : new Date(0);
  let weeklyXP = resetAt < lastMonday ? 0 : profile.weekly_xp || 0;
  if (totalXPChange > 0) weeklyXP += totalXPChange;

  const longestStreak = Math.max(profile.longest_streak || 0, newStreak);

  const updatePayload: any = {
    total_xp: newTotal,
    current_tier: finalTier,
    current_division: finalTier === "champion" ? null : finalDiv,
    current_division_xp: finalDivXP,
    current_streak: newStreak,
    longest_streak: longestStreak,
    inactive_days: newInactiveDays,
    last_active_date: newLastActiveDate,
    weekly_xp: weeklyXP,
    weekly_xp_reset_at: resetAt < lastMonday ? lastMonday.toISOString() : profile.weekly_xp_reset_at,
    updated_at: new Date().toISOString(),
  };

  if (pendingRankEvent) {
    const existingPending = profile.pending_rank_event;
    if (Array.isArray(existingPending)) {
      updatePayload.pending_rank_event = [...existingPending, pendingRankEvent];
    } else if (existingPending && typeof existingPending === "object") {
      updatePayload.pending_rank_event = [existingPending, pendingRankEvent];
    } else {
      updatePayload.pending_rank_event = [pendingRankEvent];
    }
  }

  if (rankChange === "division_up" || rankChange === "tier_up" || rankChange === "champion_in") {
    updatePayload.last_rank_up_at = new Date().toISOString();
  }

  await db
    .from("ranked_profiles")
    .update(updatePayload)
    .eq("user_id", clientId);

  return {
    skipped: false,
    xpChange: totalXPChange,
    transactions: txBatch.length,
    newTotal,
    tier: finalTier,
    division: finalDiv,
    rankChange,
    streak: newStreak,
    inactiveDays: newInactiveDays,
  };
}

function getLastMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}
