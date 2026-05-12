/**
 * useClientProgram — Single source of truth for client program data.
 * Do not duplicate this query elsewhere.
 *
 * Queries by client_id only. Does NOT filter by coach_id.
 * Relies entirely on RLS to enforce access (coach ownership, admin, client self-access).
 * Used by both coach-side Training tab and client-side Training tab.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface ProgramWorkoutItem {
  id: string;
  workout_id: string;
  workout_name: string;
  day_of_week: number;
  day_label: string;
  sort_order?: number | null;
  exclude_from_numbering?: boolean;
  custom_tag?: string | null;
}

export interface ProgramPhase {
  id: string;
  name: string;
  description: string | null;
  phase_order: number;
  duration_weeks: number;
  training_style: string | null;
  intensity_system: string | null;
  progression_rule: string | null;
  directWorkouts: ProgramWorkoutItem[];
}

export interface ProgramWeek {
  id: string;
  week_number: number;
  name: string;
  phase_id: string | null;
  workouts: ProgramWorkoutItem[];
}

export interface ClientProgramData {
  assignment: any | null;
  program: any | null;
  phases: ProgramPhase[];
  weeks: ProgramWeek[];
}

export function useClientProgram(clientId: string | undefined) {
  const [data, setData] = useState<ClientProgramData>({
    assignment: null,
    program: null,
    phases: [],
    weeks: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      // Step 1: Get active assignment
      const { data: assignData, error: assignErr } = await supabase
        .from("client_program_assignments")
        .select("*")
        .eq("client_id", clientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignErr) {
        console.error("[useClientProgram] assignment error:", assignErr);
        setError(assignErr.message);
        setData({ assignment: null, program: null, phases: [], weeks: [] });
        setLoading(false);
        return;
      }

      if (!assignData) {
        setData({ assignment: null, program: null, phases: [], weeks: [] });
        setLoading(false);
        return;
      }

      // Step 2: Get program
      const { data: prog, error: progErr } = await supabase
        .from("programs")
        .select("id, name, description, goal_type, version_number, is_master, start_date, end_date, duration_weeks")
        .eq("id", assignData.program_id)
        .maybeSingle();

      if (progErr || !prog) {
        console.error("[useClientProgram] program error:", progErr);
        setData({ assignment: null, program: null, phases: [], weeks: [] });
        setLoading(false);
        return;
      }

      // Step 3: Fetch phases and weeks in parallel using Promise.allSettled
      const [phasesResult, weeksResult] = await Promise.allSettled([
        supabase.from("program_phases").select("*").eq("program_id", prog.id).order("phase_order"),
        supabase.from("program_weeks").select("id, week_number, name, phase_id").eq("program_id", prog.id).order("week_number"),
      ]);

      const phaseData = phasesResult.status === "fulfilled" ? phasesResult.value.data || [] : [];
      const weekData = weeksResult.status === "fulfilled" ? weeksResult.value.data || [] : [];

      if (phasesResult.status === "rejected") console.error("[useClientProgram] phases fetch failed:", phasesResult.reason);
      if (weeksResult.status === "rejected") console.error("[useClientProgram] weeks fetch failed:", weeksResult.reason);

      // Step 4: Fetch phase workouts
      const phaseIds = phaseData.map((p: any) => p.id);
      let phaseDirectMap: Record<string, ProgramWorkoutItem[]> = {};

      if (phaseIds.length > 0) {
        const { data: directPWs } = await supabase
          .from("program_workouts")
          .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(id, name)")
          .in("phase_id", phaseIds)
          .order("sort_order");

        for (const pw of directPWs || []) {
          const pid = (pw as any).phase_id;
          if (!phaseDirectMap[pid]) phaseDirectMap[pid] = [];
          phaseDirectMap[pid].push({
            id: pw.id,
            workout_id: pw.workout_id,
            workout_name: (pw.workouts as any)?.name || "Workout",
            day_of_week: pw.day_of_week ?? 0,
            day_label: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
            sort_order: pw.sort_order,
            exclude_from_numbering: (pw as any).exclude_from_numbering || false,
            custom_tag: (pw as any).custom_tag || null,
          });
        }
      }

      const phases: ProgramPhase[] = phaseData.map((p: any) => ({
        ...p,
        directWorkouts: phaseDirectMap[p.id] || [],
      }));

      // Step 5: Fetch week workouts
      let weeks: ProgramWeek[] = [];
      if (weekData.length > 0) {
        const weekIds = weekData.map((w: any) => w.id);
        const { data: pwData } = await supabase
          .from("program_workouts")
          .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(id, name)")
          .in("week_id", weekIds)
          .order("sort_order");

        weeks = weekData.map((w: any) => ({
          ...w,
          workouts: (pwData || [])
            .filter((pw: any) => pw.week_id === w.id)
            .map((pw: any) => ({
              id: pw.id,
              workout_id: pw.workout_id,
              workout_name: (pw.workouts as any)?.name || "Workout",
              day_of_week: pw.day_of_week ?? 0,
              day_label: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
            })),
        }));
      }

      setData({ assignment: assignData, program: prog, phases, weeks });
    } catch (err: any) {
      console.error("[useClientProgram] unexpected error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  return { ...data, loading, error, reload: load };
}
