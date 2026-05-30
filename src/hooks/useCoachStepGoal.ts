import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getLocalDateString } from "@/utils/localDate";

const stepGoalErrorToasts = new Set<string>();

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
  const { toast } = useToast();
  const [coachGoal, setCoachGoal] = useState<number | null>(null);
  const backfilledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCoachGoal(null);
      return;
    }
    let cancelled = false;

    const showLoadError = (message: string) => {
      const key = `${user.id}:${getLocalDateString()}:${message}`;
      if (stepGoalErrorToasts.has(key)) return;
      stepGoalErrorToasts.add(key);
      toast({ title: "Step goal could not load", description: message, variant: "destructive" });
    };

    const loadAndBackfill = async () => {
      const today = getLocalDateString();
      const { data, error } = await supabase
        .from("nutrition_targets")
        .select("daily_step_goal")
        .eq("client_id", user.id)
        .lte("effective_date", today)
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("[useCoachStepGoal] Failed to load coach step goal:", error);
        showLoadError("Using the saved health-metrics goal until the coach target is available.");
        return;
      }

      const goal = data?.daily_step_goal;
      if (!goal || goal <= 0) {
        setCoachGoal(null);
        return;
      }

      setCoachGoal(goal);

      // Backfill today's health metrics row if it differs
      const backfillKey = `${user.id}:${today}:${goal}`;
      if (backfilledRef.current === backfillKey) return;
      backfilledRef.current = backfillKey;

      const { data: todayRow, error: todayRowError } = await supabase
        .from("daily_health_metrics")
        .select("step_goal, source")
        .eq("user_id", user.id)
        .eq("metric_date", today)
        .maybeSingle();

      if (todayRowError) {
        console.error("[useCoachStepGoal] Failed to read today's health metrics row:", todayRowError);
        showLoadError("The dashboard will still show the coach target, but today's health row could not be reconciled.");
        return;
      }

      if (!todayRow || todayRow.step_goal !== goal) {
        const { error: upsertError } = await supabase
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
        if (upsertError) {
          console.error("[useCoachStepGoal] Failed to backfill today's step goal:", upsertError);
          showLoadError("The dashboard will still show the coach target, but the health row could not be updated.");
        }
      }
    };

    loadAndBackfill();

    const channel = supabase
      .channel(`coach-step-goal-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nutrition_targets",
          filter: `client_id=eq.${user.id}`,
        },
        () => {
          loadAndBackfill();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [toast, user]);

  return coachGoal ?? fallback ?? 10000;
}
