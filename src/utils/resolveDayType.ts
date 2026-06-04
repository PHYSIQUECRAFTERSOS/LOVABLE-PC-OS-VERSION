import { supabase } from "@/integrations/supabase/client";
import { toLocalDateString } from "@/utils/localDate";

export type DayType = "training_day" | "rest_day";

/**
 * Single source of truth for determining if a given date is a training day
 * or rest day for a client. Checks calendar_events for workout events.
 *
 * Workouts flagged as `is_accessory` (vacuums, stretches, mobility) DO NOT
 * count as training — the day stays "rest_day" so nutrition macros use
 * rest-day targets.
 *
 * Defaults to 'training_day' on error (fail-safe).
 */
export async function resolveDayType(
  clientId: string,
  date: Date = new Date()
): Promise<DayType> {
  const localDate = toLocalDateString(date);

  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, linked_workout_id, workouts:linked_workout_id(is_accessory)")
    .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`)
    .eq("event_type", "workout")
    .eq("event_date", localDate);

  if (error) {
    console.error("[resolveDayType] Error:", error);
    return "training_day"; // fail safe
  }

  const hasRealWorkout = (data || []).some((e: any) => {
    // Manual workout event with no linked workout: treat as real workout.
    if (!e.linked_workout_id) return true;
    // Linked accessory workouts don't count toward training-day status.
    return !e.workouts?.is_accessory;
  });

  return hasRealWorkout ? "training_day" : "rest_day";
}

/**
 * Given a nutrition_targets row, resolve the effective targets for a day type.
 * Falls back to training day values when rest day values are null.
 */
export function resolveTargetsForDayType(
  target: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    rest_calories?: number | null;
    rest_protein?: number | null;
    rest_carbs?: number | null;
    rest_fat?: number | null;
  },
  dayType: DayType
): { calories: number; protein: number; carbs: number; fat: number } {
  if (dayType === "rest_day" && target.rest_calories != null) {
    return {
      calories: target.rest_calories,
      protein: target.rest_protein ?? target.protein,
      carbs: target.rest_carbs ?? target.carbs,
      fat: target.rest_fat ?? target.fat,
    };
  }
  return {
    calories: target.calories,
    protein: target.protein,
    carbs: target.carbs,
    fat: target.fat,
  };
}
