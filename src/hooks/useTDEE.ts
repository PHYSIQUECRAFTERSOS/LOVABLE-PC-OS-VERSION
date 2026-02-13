import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, subDays, differenceInDays } from "date-fns";

interface WeightEntry {
  logged_at: string;
  weight: number;
}

interface NutritionDay {
  date: string;
  calories: number;
}

interface TDEEResult {
  estimatedTDEE: number;
  avgDailyCalories: number;
  avgWeight: number;
  weightChangeRate: number; // lbs per week
  adherencePct: number;
  rollingAvg7: number | null;
  rollingAvg14: number | null;
  dataPoints: number;
  weightHistory: { date: string; weight: number; avg7?: number }[];
  tdeeHistory: { date: string; tdee: number }[];
  adjustmentHistory: AdjustmentEntry[];
  currentGoal: GoalData | null;
  weeklyInsight: string;
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

function estimateTDEE(avgCalories: number, weightChangeRate: number): number {
  // TDEE = avg calories consumed + (weight change per day * 3500)
  // If losing weight, TDEE > calories consumed
  const dailyChange = weightChangeRate / 7;
  return Math.round(avgCalories + dailyChange * CALORIES_PER_LB);
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
  } else {
    if (Math.abs(weightChangeRate) < 0.2) {
      insight += "Weight is stable — maintenance is on point.";
    }
  }

  return insight;
}

export function useTDEE() {
  const { user } = useAuth();
  const [result, setResult] = useState<TDEEResult | null>(null);
  const [loading, setLoading] = useState(true);

  const calculate = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

    // Fetch all data in parallel
    const [weightsRes, logsRes, targetsRes, tdeeHistRes, adjRes, goalRes] = await Promise.all([
      supabase.from("weight_logs").select("logged_at, weight").eq("client_id", user.id).gte("logged_at", thirtyDaysAgo).order("logged_at", { ascending: true }),
      supabase.from("nutrition_logs").select("logged_at, calories").eq("client_id", user.id).gte("logged_at", thirtyDaysAgo),
      supabase.from("nutrition_targets").select("calories").eq("client_id", user.id).lte("effective_date", today).order("effective_date", { ascending: false }).limit(1),
      supabase.from("tdee_estimates").select("calculated_at, estimated_tdee").eq("client_id", user.id).order("calculated_at", { ascending: true }).limit(30),
      supabase.from("macro_adjustment_history").select("*").eq("client_id", user.id).order("adjustment_date", { ascending: false }).limit(10),
      supabase.from("client_goals").select("goal, target_rate, starting_weight, target_weight").eq("client_id", user.id).limit(1),
    ]);

    const weights = (weightsRes.data || []) as WeightEntry[];
    const nutritionLogs = (logsRes.data || []) as { logged_at: string; calories: number }[];
    const targetCalories = targetsRes.data?.[0]?.calories || 2000;

    // Group nutrition logs by day
    const dailyCals: Record<string, number> = {};
    nutritionLogs.forEach((l) => {
      dailyCals[l.logged_at] = (dailyCals[l.logged_at] || 0) + Number(l.calories);
    });
    const daysLogged = Object.keys(dailyCals).length;
    const totalCalsLogged = Object.values(dailyCals).reduce((s, c) => s + c, 0);
    const avgDailyCalories = daysLogged > 0 ? Math.round(totalCalsLogged / daysLogged) : 0;

    // Calculate adherence (% of days within 10% of target)
    const daysWithinTarget = Object.values(dailyCals).filter(
      (c) => Math.abs(c - targetCalories) / targetCalories <= 0.1
    ).length;
    const adherencePct = daysLogged > 0 ? (daysWithinTarget / daysLogged) * 100 : 0;

    const rollingAvg7 = computeRollingAvg(weights, 7);
    const rollingAvg14 = computeRollingAvg(weights, 14);
    const weightChangeRate = computeWeightChangeRate(weights);
    const avgWeight = weights.length > 0 ? weights.reduce((s, w) => s + Number(w.weight), 0) / weights.length : 0;
    const tdee = avgDailyCalories > 0 ? estimateTDEE(avgDailyCalories, weightChangeRate) : 0;

    // Build weight history with 7-day rolling average
    const weightHistory = weights.map((w, i) => {
      const slice = weights.slice(Math.max(0, i - 6), i + 1);
      const avg = slice.length >= 3 ? slice.reduce((s, x) => s + Number(x.weight), 0) / slice.length : undefined;
      return { date: w.logged_at, weight: Number(w.weight), avg7: avg ? Math.round(avg * 10) / 10 : undefined };
    });

    const currentGoal = goalRes.data?.[0] as GoalData | null;
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
      tdeeHistory: (tdeeHistRes.data || []).map((d: any) => ({ date: d.calculated_at, tdee: Number(d.estimated_tdee) })),
      adjustmentHistory: (adjRes.data || []) as AdjustmentEntry[],
      currentGoal,
      weeklyInsight,
    });

    setLoading(false);
  }, [user]);

  useEffect(() => { calculate(); }, [calculate]);

  return { result, loading, recalculate: calculate };
}
