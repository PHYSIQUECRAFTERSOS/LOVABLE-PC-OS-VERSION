import { supabase } from "@/integrations/supabase/client";
import { toLocalDateString } from "@/utils/localDate";

export type DayType = "training_day" | "rest_day";

/**
 * Single source of truth for determining if a given date is a training day
 * or rest day for a client. Checks calendar_events for workout events.
 * 
 * Uses `user_id` on calendar_events (not client_id) since that's how the
 * table is structured. For coach-side queries, pass the client's user ID.
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
    .select("id")
    .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`)
    .eq("event_type", "workout")
    .eq("event_date", localDate)
    .limit(1);

  if (error) {
    console.error("[resolveDayType] Error:", error);
    return "training_day"; // fail safe
  }

  return data && data.length > 0 ? "training_day" : "rest_day";
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
