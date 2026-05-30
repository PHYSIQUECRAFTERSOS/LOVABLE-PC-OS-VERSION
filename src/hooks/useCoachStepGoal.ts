import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getLocalDateString } from "@/utils/localDate";

/**
 * Resolves the authoritative step goal for the current client.
 * Priority: nutrition_targets.daily_step_goal (coach-set) → fallback → 10000.
 *
 * Also backfills today's daily_health_metrics.step_goal so other surfaces
 * (trend modal, biofeedback screen, coach view) stay consistent.
 * Backfill runs at most once per session per day.
 */
export function useCoachStepGoal(fallback?: number | null): number {
  const { user } = useAuth();
  const [coachGoal, setCoachGoal] = useState<number | null>(null);
  const backfilledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("nutrition_targets")
        .select("daily_step_goal")
        .eq("client_id", user.id)
        .maybeSingle();

      const goal = (data as any)?.daily_step_goal;
      if (cancelled) return;
      if (!goal || goal <= 0) return;

      setCoachGoal(goal);

      // Backfill today's health metrics row if it differs
      const today = getLocalDateString();
      const backfillKey = `${user.id}:${today}:${goal}`;
      if (backfilledRef.current === backfillKey) return;
      backfilledRef.current = backfillKey;

      const { data: todayRow } = await supabase
        .from("daily_health_metrics")
        .select("step_goal, source")
        .eq("user_id", user.id)
        .eq("metric_date", today)
        .maybeSingle();

      if (!todayRow || todayRow.step_goal !== goal) {
        await supabase
          .from("daily_health_metrics")
          .upsert(
            {
              user_id: user.id,
              metric_date: today,
              step_goal: goal,
              source: todayRow?.source || "manual",
            },
            { onConflict: "user_id,metric_date" }
          );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return coachGoal ?? fallback ?? 10000;
}
