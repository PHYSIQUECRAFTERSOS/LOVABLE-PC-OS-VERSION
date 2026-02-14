import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays, differenceInDays } from "date-fns";

interface WeightEntry {
  logged_at: string;
  weight: number;
}

interface TDEEResult {
  estimatedTDEE: number;
  avgDailyCalories: number;
  avgWeight: number;
  weightChangeRate: number;
  adherencePct: number;
  rollingAvg7: number | null;
  rollingAvg14: number | null;
  dataPoints: number;
  weightHistory: { date: string; weight: number; avg7?: number }[];
  tdeeHistory: { date: string; tdee: number }[];
  adjustmentHistory: AdjustmentEntry[];
  currentGoal: GoalData | null;
  weeklyInsight: string;
  biofeedback: BiofeedbackData;
  metabolicAdaptationPct: number;
  predicted4WeekWeight: number | null;
  expectedWeeklyRate: number;
  phaseContext: PhaseContext;
}

interface AdjustmentEntry {
  id: string;
  previous_calories: number;
  new_calories: number;
  reason: string;
  estimated_tdee: number | null;
  adjustment_date: string;
}

interface GoalData {
  goal: string;
  target_rate: number;
  starting_weight: number | null;
  target_weight: number | null;
  aggressiveness?: number;
}

interface BiofeedbackData {
  avgSteps: number;
  avgSleepHours: number;
  cardioMinutes: number;
  trainingSessions: number;
}

interface PhaseContext {
  phase: string;
  weeksInPhase: number;
  isReverseEligible: boolean;
  deficitTooAggressive: boolean;
  suggestedAction: string | null;
}

const CALORIES_PER_LB = 3500;

function computeRollingAvg(weights: WeightEntry[], days: number): number | null {
  if (weights.length < days) return null;
  const recent = weights.slice(-days);
  return recent.reduce((s, w) => s + Number(w.weight), 0) / recent.length;
}

function computeWeightChangeRate(weights: WeightEntry[]): number {
  if (weights.length < 7) return 0;
  const recent7 = weights.slice(-7);
  const prior7 = weights.length >= 14 ? weights.slice(-14, -7) : weights.slice(0, Math.min(7, weights.length - 7));
  if (prior7.length === 0) return 0;
  const avgRecent = recent7.reduce((s, w) => s + Number(w.weight), 0) / recent7.length;
  const avgPrior = prior7.reduce((s, w) => s + Number(w.weight), 0) / prior7.length;
  const daySpan = differenceInDays(
    new Date(recent7[recent7.length - 1].logged_at),
    new Date(prior7[0].logged_at)
  );
  if (daySpan === 0) return 0;
  return ((avgRecent - avgPrior) / daySpan) * 7;
}

function estimateTDEE(avgCalories: number, weightChangeRate: number, biofeedback: BiofeedbackData): number {
  const dailyChange = weightChangeRate / 7;
  let baseTDEE = Math.round(avgCalories + dailyChange * CALORIES_PER_LB);

  // Biofeedback adjustments - subtle modifiers for accuracy
  const stepFactor = biofeedback.avgSteps > 10000 ? 1.02 : biofeedback.avgSteps < 5000 ? 0.98 : 1;
  const sleepFactor = biofeedback.avgSleepHours < 6 ? 0.97 : biofeedback.avgSleepHours > 8 ? 1.01 : 1;

  return Math.round(baseTDEE * stepFactor * sleepFactor);
}

function detectMetabolicAdaptation(tdeeHistory: { date: string; tdee: number }[]): number {
  if (tdeeHistory.length < 4) return 0;
  const recent = tdeeHistory.slice(-4);
  const earlier = tdeeHistory.slice(0, Math.min(4, tdeeHistory.length - 4));
  if (earlier.length === 0) return 0;
  const avgRecent = recent.reduce((s, t) => s + t.tdee, 0) / recent.length;
  const avgEarlier = earlier.reduce((s, t) => s + t.tdee, 0) / earlier.length;
  if (avgEarlier === 0) return 0;
  return Math.round(((avgRecent - avgEarlier) / avgEarlier) * 100);
}

function computePhaseContext(
  goal: GoalData | null,
  weightChangeRate: number,
  weeksOfData: number,
  metabolicAdaptation: number
): PhaseContext {
  const phase = goal?.goal || "maintain";
  const aggressiveness = goal?.aggressiveness || 0.5;
  const targetRate = goal?.target_rate || 0.5;

  let deficitTooAggressive = false;
  let isReverseEligible = false;
  let suggestedAction: string | null = null;

  if (phase === "cut") {
    // Flag if losing more than 1.5% bodyweight per week equivalent
    if (weightChangeRate < -(targetRate * 1.5)) {
      deficitTooAggressive = true;
      suggestedAction = "Rate of loss exceeds safe threshold. Recommend increasing calories by 100-150 kcal.";
    }
    // Check for metabolic adaptation after 12+ weeks
    if (weeksOfData >= 12 && metabolicAdaptation < -8) {
      isReverseEligible = true;
      suggestedAction = "Significant metabolic adaptation detected. Consider a diet break or reverse diet phase.";
    }
  } else if (phase === "reverse_diet") {
    if (weightChangeRate > 0.3) {
      suggestedAction = "Weight gain exceeding reverse diet targets. Slow the calorie increase.";
    }
  } else if (phase === "lean_gain") {
    if (weightChangeRate > targetRate + 0.3) {
      suggestedAction = "Gaining faster than target. Reduce surplus by 50-100 kcal.";
    }
  }

  return {
    phase,
    weeksInPhase: weeksOfData,
    isReverseEligible,
    deficitTooAggressive,
    suggestedAction,
  };
}

function generateInsight(
  tdee: number,
  weightChangeRate: number,
  adherencePct: number,
  goal: string | null,
  targetRate: number
): string {
  const rateStr = Math.abs(weightChangeRate).toFixed(1);
  const direction = weightChangeRate < -0.1 ? "dropped" : weightChangeRate > 0.1 ? "increased" : "remained stable";

  let insight = `Your average weight ${direction}${direction !== "remained stable" ? ` at ${rateStr} lb/week` : ""}. `;
  insight += `Based on ${Math.round(adherencePct)}% adherence, your estimated TDEE is ${tdee.toLocaleString()} kcal. `;

  if (goal === "cut") {
    if (weightChangeRate < -0.3 && weightChangeRate > -(targetRate + 0.3)) {
      insight += "You're on track for your fat loss goal. Keep it up.";
    } else if (weightChangeRate <= -(targetRate + 0.3)) {
      insight += "⚠️ You're losing faster than recommended. Consider increasing calories to preserve muscle.";
    } else if (weightChangeRate > -0.1) {
      insight += "Weight isn't trending down. A small calorie reduction may be needed.";
    }
  } else if (goal === "lean_gain") {
    if (weightChangeRate > 0.1 && weightChangeRate < targetRate + 0.2) {
      insight += "Lean gain is progressing well.";
    } else if (weightChangeRate >= targetRate + 0.2) {
      insight += "⚠️ Gaining faster than target. Consider a slight calorie reduction.";
    }
  } else if (goal === "reverse_diet") {
    if (Math.abs(weightChangeRate) < 0.3) {
      insight += "Reverse diet is progressing smoothly. Metabolic recovery is on track.";
    }
  } else {
    if (Math.abs(weightChangeRate) < 0.2) {
      insight += "Weight is stable — maintenance is on point.";
    }
  }

  return insight;
}

export function useTDEE(targetClientId?: string) {
  const { user } = useAuth();
  const [result, setResult] = useState<TDEEResult | null>(null);
  const [loading, setLoading] = useState(true);

  const calculate = useCallback(async () => {
    const clientId = targetClientId || user?.id;
    if (!clientId) return;
    setLoading(true);

    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

    const [weightsRes, logsRes, targetsRes, tdeeHistRes, adjRes, goalRes, cardioRes, sessionsRes, measurementsRes] = await Promise.all([
      supabase.from("weight_logs").select("logged_at, weight").eq("client_id", clientId).gte("logged_at", thirtyDaysAgo).order("logged_at", { ascending: true }),
      supabase.from("nutrition_logs").select("logged_at, calories").eq("client_id", clientId).gte("logged_at", thirtyDaysAgo),
      supabase.from("nutrition_targets").select("calories").eq("client_id", clientId).lte("effective_date", today).order("effective_date", { ascending: false }).limit(1),
      supabase.from("tdee_estimates").select("calculated_at, estimated_tdee").eq("client_id", clientId).order("calculated_at", { ascending: true }).limit(30),
      supabase.from("macro_adjustment_history").select("*").eq("client_id", clientId).order("adjustment_date", { ascending: false }).limit(10),
      supabase.from("client_goals").select("goal, target_rate, starting_weight, target_weight, aggressiveness").eq("client_id", clientId).limit(1),
      // Biofeedback data
      supabase.from("cardio_logs").select("duration_min").eq("client_id", clientId).gte("logged_at", thirtyDaysAgo),
      supabase.from("workout_sessions").select("id").eq("client_id", clientId).gte("started_at", thirtyDaysAgo),
      supabase.from("body_measurements").select("steps, sleep_hours").eq("client_id", clientId).gte("measured_at", thirtyDaysAgo),
    ]);

    const weights = (weightsRes.data || []) as WeightEntry[];
    const nutritionLogs = (logsRes.data || []) as { logged_at: string; calories: number }[];
    const targetCalories = targetsRes.data?.[0]?.calories || 2000;

    // Biofeedback aggregation
    const cardioMinutes = (cardioRes.data || []).reduce((s: number, c: any) => s + (Number(c.duration_min) || 0), 0);
    const trainingSessions = (sessionsRes.data || []).length;
    const measurements = measurementsRes.data || [];
    const avgSteps = measurements.length > 0
      ? Math.round(measurements.reduce((s: number, m: any) => s + (m.steps || 0), 0) / measurements.length)
      : 0;
    const avgSleepHours = measurements.length > 0
      ? Math.round((measurements.reduce((s: number, m: any) => s + (Number(m.sleep_hours) || 0), 0) / measurements.length) * 10) / 10
      : 0;

    const biofeedback: BiofeedbackData = { avgSteps, avgSleepHours, cardioMinutes, trainingSessions };

    // Group nutrition logs by day
    const dailyCals: Record<string, number> = {};
    nutritionLogs.forEach((l) => {
      dailyCals[l.logged_at] = (dailyCals[l.logged_at] || 0) + Number(l.calories);
    });
    const daysLogged = Object.keys(dailyCals).length;
    const totalCalsLogged = Object.values(dailyCals).reduce((s, c) => s + c, 0);
    const avgDailyCalories = daysLogged > 0 ? Math.round(totalCalsLogged / daysLogged) : 0;

    // Adherence
    const daysWithinTarget = Object.values(dailyCals).filter(
      (c) => Math.abs(c - targetCalories) / targetCalories <= 0.1
    ).length;
    const adherencePct = daysLogged > 0 ? (daysWithinTarget / daysLogged) * 100 : 0;

    const rollingAvg7 = computeRollingAvg(weights, 7);
    const rollingAvg14 = computeRollingAvg(weights, 14);
    const weightChangeRate = computeWeightChangeRate(weights);
    const avgWeight = weights.length > 0 ? weights.reduce((s, w) => s + Number(w.weight), 0) / weights.length : 0;
    const tdee = avgDailyCalories > 0 ? estimateTDEE(avgDailyCalories, weightChangeRate, biofeedback) : 0;

    // Weight history with 7-day rolling average
    const weightHistory = weights.map((w, i) => {
      const slice = weights.slice(Math.max(0, i - 6), i + 1);
      const avg = slice.length >= 3 ? slice.reduce((s, x) => s + Number(x.weight), 0) / slice.length : undefined;
      return { date: w.logged_at, weight: Number(w.weight), avg7: avg ? Math.round(avg * 10) / 10 : undefined };
    });

    const tdeeHistory = (tdeeHistRes.data || []).map((d: any) => ({ date: d.calculated_at, tdee: Number(d.estimated_tdee) }));
    const metabolicAdaptationPct = detectMetabolicAdaptation(tdeeHistory);

    const currentGoal = goalRes.data?.[0] as GoalData | null;
    const weeksOfData = weights.length > 0
      ? Math.round(differenceInDays(new Date(), new Date(weights[0].logged_at)) / 7)
      : 0;
    const phaseContext = computePhaseContext(currentGoal, weightChangeRate, weeksOfData, metabolicAdaptationPct);

    // Predicted 4-week weight
    const currentWeight = rollingAvg7 || avgWeight;
    const predicted4WeekWeight = currentWeight > 0
      ? Math.round((currentWeight + (weightChangeRate * 4)) * 10) / 10
      : null;

    // Expected weekly rate based on phase
    const expectedWeeklyRate = currentGoal?.goal === "cut"
      ? -(currentGoal.target_rate || 0.5)
      : currentGoal?.goal === "lean_gain"
        ? (currentGoal.target_rate || 0.25)
        : 0;

    const weeklyInsight = generateInsight(tdee, weightChangeRate, adherencePct, currentGoal?.goal || null, currentGoal?.target_rate || 0.5);

    setResult({
      estimatedTDEE: tdee,
      avgDailyCalories,
      avgWeight: Math.round(avgWeight * 10) / 10,
      weightChangeRate: Math.round(weightChangeRate * 100) / 100,
      adherencePct: Math.round(adherencePct),
      rollingAvg7: rollingAvg7 ? Math.round(rollingAvg7 * 10) / 10 : null,
      rollingAvg14: rollingAvg14 ? Math.round(rollingAvg14 * 10) / 10 : null,
      dataPoints: weights.length,
      weightHistory,
      tdeeHistory,
      adjustmentHistory: (adjRes.data || []) as AdjustmentEntry[],
      currentGoal,
      weeklyInsight,
      biofeedback,
      metabolicAdaptationPct,
      predicted4WeekWeight,
      expectedWeeklyRate,
      phaseContext,
    });

    setLoading(false);
  }, [user, targetClientId]);

  useEffect(() => { calculate(); }, [calculate]);

  return { result, loading, recalculate: calculate };
}
