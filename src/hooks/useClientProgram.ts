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
      setData(cached.data);
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
      // One secured database call replaces the former five-query RLS-heavy
      // waterfall. Access is checked once inside the function.
      const { data: bundleData, error: bundleError } = await withRetry(
        async () => await supabase.rpc("get_client_program_bundle_fast", { _client_id: clientId }),
        { label: "client program bundle", timeoutMs: 10000, attempts: 1 },
      );

      if (bundleError) throw bundleError;

      const bundle = bundleData as unknown as ClientProgramData | null;
      const next: ClientProgramData = bundle
        ? {
            assignment: bundle.assignment ?? null,
            program: bundle.program ?? null,
            phases: (bundle.phases || []).map((phase) => ({
              ...phase,
              directWorkouts: (phase.directWorkouts || []).map((workout) => ({
                ...workout,
                day_label: workout.day_label || DAY_LABELS[workout.day_of_week ?? 0],
              })),
            })),
            weeks: (bundle.weeks || []).map((week) => ({
              ...week,
              workouts: (week.workouts || []).map((workout) => ({
                ...workout,
                day_label: workout.day_label || DAY_LABELS[workout.day_of_week ?? 0],
              })),
            })),
          }
        : { assignment: null, program: null, phases: [], weeks: [] };
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

