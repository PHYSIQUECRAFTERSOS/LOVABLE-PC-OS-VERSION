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
import { withRetry } from "@/lib/resilientFetch";


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

// In-memory cache keyed by clientId. Coach navigating between clients gets
// instant loads for previously visited clients; realtime mutations invalidate.
const CACHE_TTL_MS = 60 * 1000;
const programCache = new Map<string, { data: ClientProgramData; ts: number }>();

export function invalidateClientProgramCache(clientId?: string) {
  if (clientId) programCache.delete(clientId);
  else programCache.clear();
}

export function useClientProgram(clientId: string | undefined) {
  const [data, setData] = useState<ClientProgramData>(() => {
    const cached = clientId ? programCache.get(clientId) : null;
    return cached && Date.now() - cached.ts < CACHE_TTL_MS
      ? cached.data
      : { assignment: null, program: null, phases: [], weeks: [] };
  });
  const [loading, setLoading] = useState(() => {
    const cached = clientId ? programCache.get(clientId) : null;
    return !(cached && Date.now() - cached.ts < CACHE_TTL_MS);
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!clientId) { setLoading(false); return; }

    // Serve from cache when fresh (unless caller forced a reload).
    const cached = programCache.get(clientId);
    const fresh = cached && Date.now() - cached.ts < CACHE_TTL_MS;
    if (fresh && !opts?.force) {
      setData(cached!.data);
      setLoading(false);
      return;
    }

    // Stale-while-revalidate: show cached data instantly, refresh in background.
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Step 1: Active assignment + its program in a single round-trip (joined).
      const { data: assignData, error: assignErr } = await withRetry(
        async () =>
          await supabase
            .from("client_program_assignments")
            .select("*, programs!client_program_assignments_program_id_fkey(id, name, description, goal_type, version_number, is_master, start_date, end_date, duration_weeks)")
            .eq("client_id", clientId)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),

        { label: "client program assignment", timeoutMs: 10000, attempts: 3 },
      );

      if (assignErr) {

        console.error("[useClientProgram] assignment error:", assignErr);
        setError(assignErr.message);
        const empty = { assignment: null, program: null, phases: [], weeks: [] };
        programCache.set(clientId, { data: empty, ts: Date.now() });
        setData(empty);
        setLoading(false);
        return;
      }

      const prog = (assignData as any)?.programs || null;

      if (!assignData || !prog) {
        const empty = { assignment: null, program: null, phases: [], weeks: [] };
        programCache.set(clientId, { data: empty, ts: Date.now() });
        setData(empty);
        setLoading(false);
        return;
      }

      // Step 2: Fetch phases and weeks in parallel using Promise.allSettled
      const [phasesResult, weeksResult] = await Promise.allSettled([
        withRetry(async () => await supabase.from("program_phases").select("*").eq("program_id", prog.id).order("phase_order"), { label: "program phases", timeoutMs: 10000 }),
        withRetry(async () => await supabase.from("program_weeks").select("id, week_number, name, phase_id").eq("program_id", prog.id).order("week_number"), { label: "program weeks", timeoutMs: 10000 }),
      ]);



      const phaseData = phasesResult.status === "fulfilled" ? phasesResult.value.data || [] : [];
      const weekData = weeksResult.status === "fulfilled" ? weeksResult.value.data || [] : [];

      if (phasesResult.status === "rejected") console.error("[useClientProgram] phases fetch failed:", phasesResult.reason);
      if (weeksResult.status === "rejected") console.error("[useClientProgram] weeks fetch failed:", weeksResult.reason);

      // Step 3: Fetch phase workouts and week workouts in one parallel wave.
      const phaseIds = phaseData.map((p: any) => p.id);
      const weekIds = weekData.map((w: any) => w.id);

      const [phasePwRes, weekPwRes] = await Promise.allSettled([
        phaseIds.length > 0
          ? withRetry(async () => await supabase
              .from("program_workouts")
              .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(id, name)")
              .in("phase_id", phaseIds)
              .order("sort_order"), { label: "phase workouts", timeoutMs: 10000 })
          : Promise.resolve({ data: [] as any[] }),
        weekIds.length > 0
          ? withRetry(async () => await supabase
              .from("program_workouts")
              .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(id, name)")
              .in("week_id", weekIds)
              .order("sort_order"), { label: "week workouts", timeoutMs: 10000 })
          : Promise.resolve({ data: [] as any[] }),
      ]);


      const directPWs = phasePwRes.status === "fulfilled" ? (phasePwRes.value as any).data || [] : [];
      const pwData = weekPwRes.status === "fulfilled" ? (weekPwRes.value as any).data || [] : [];

      const phaseDirectMap: Record<string, ProgramWorkoutItem[]> = {};
      for (const pw of directPWs) {
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

      const phases: ProgramPhase[] = phaseData.map((p: any) => ({
        ...p,
        directWorkouts: phaseDirectMap[p.id] || [],
      }));

      const weeks: ProgramWeek[] = weekData.map((w: any) => ({
        ...w,
        workouts: pwData
          .filter((pw: any) => pw.week_id === w.id)
          .map((pw: any) => ({
            id: pw.id,
            workout_id: pw.workout_id,
            workout_name: (pw.workouts as any)?.name || "Workout",
            day_of_week: pw.day_of_week ?? 0,
            day_label: pw.day_label || DAY_LABELS[pw.day_of_week ?? 0],
          })),
      }));


      const next = { assignment: assignData, program: prog, phases, weeks };
      programCache.set(clientId, { data: next, ts: Date.now() });
      setData(next);
    } catch (err: any) {
      console.error("[useClientProgram] unexpected error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  return {
    ...data,
    loading,
    error,
    reload: useCallback(() => {
      if (clientId) programCache.delete(clientId);
      return load({ force: true });
    }, [clientId, load]),
  };
}

