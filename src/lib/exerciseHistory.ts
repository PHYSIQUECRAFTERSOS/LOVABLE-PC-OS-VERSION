/**
 * Shared "last time" lookup for the workout tracker.
 *
 * The exercise library contains duplicate rows for the same lift under
 * different UUIDs (coach-built phases, AI imports). History lookups keyed
 * strictly on exercise_id therefore miss prior logs. We expand each requested
 * exercise into every library row sharing its normalized name, then remap the
 * fetched rows back onto the CURRENT exercise id.
 *
 * Used both on tracker mount (all program exercises) and on-demand when a
 * client substitutes or adds an exercise mid-session.
 */
import { supabase } from "@/integrations/supabase/client";

const KG_TO_LBS = 2.20462;

function toLbs(value: number, unit: string): number {
  if (unit === "kg") return Number((value * KG_TO_LBS).toFixed(1));
  return value;
}

export interface PersonalRecordRow {
  exercise_id: string;
  weight: number;
  reps: number;
}

export interface ExerciseHistoryResult {
  /** current exercise id → most recent completed session's sets */
  previousPerformance: Record<string, any[]>;
  /** current exercise id → all-time weight×reps pairs, always in lbs */
  allTimeBests: Record<string, { weight: number; reps: number }[]>;
  /** best PR row per current exercise id */
  personalRecords: PersonalRecordRow[];
}

const normalize = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, " ");

export async function fetchExerciseHistory(
  userId: string,
  exercises: { id: string; name?: string | null }[],
): Promise<ExerciseHistoryResult> {
  const empty: ExerciseHistoryResult = {
    previousPerformance: {},
    allTimeBests: {},
    personalRecords: [],
  };
  if (!userId || exercises.length === 0) return empty;

  // ── Identity expansion ────────────────────────────────────────────────
  const currentByNorm = new Map<string, string>(); // norm name → current id
  exercises.forEach((ex) => {
    const n = normalize(ex.name || "");
    if (n && !currentByNorm.has(n)) currentByNorm.set(n, ex.id);
  });

  const expandedIds = new Set<string>(exercises.map((e) => e.id));
  const siblingToCurrent = new Map<string, string>();
  exercises.forEach((e) => siblingToCurrent.set(e.id, e.id));

  if (currentByNorm.size > 0) {
    const { data: libRows } = await supabase.from("exercises").select("id, name");
    (libRows || []).forEach((row: { id: string; name: string | null }) => {
      const cur = currentByNorm.get(normalize(row.name || ""));
      if (cur) {
        expandedIds.add(row.id);
        if (!siblingToCurrent.has(row.id)) siblingToCurrent.set(row.id, cur);
      }
    });
  }

  const expandedIdArr = Array.from(expandedIds);
  if (expandedIdArr.length === 0) return empty;

  const [prRes, logsRes] = await Promise.all([
    supabase
      .from("personal_records")
      .select("exercise_id, weight, reps")
      .eq("client_id", userId)
      .in("exercise_id", expandedIdArr),
    supabase
      .from("exercise_logs")
      .select(
        "exercise_id, set_number, weight, reps, rir, session_id, weight_unit, workout_sessions!inner(created_at, status)",
      )
      .in("exercise_id", expandedIdArr)
      .eq("workout_sessions.client_id", userId)
      .eq("workout_sessions.status", "completed")
      .order("set_number", { ascending: true }),
  ]);

  // PRs remapped to the current exercise ids, best per id
  const prByCurrent = new Map<string, PersonalRecordRow>();
  ((prRes.data as PersonalRecordRow[] | null) || []).forEach((pr) => {
    const curId = siblingToCurrent.get(pr.exercise_id);
    if (!curId) return;
    const existing = prByCurrent.get(curId);
    if (!existing || (pr.weight || 0) > (existing.weight || 0)) {
      prByCurrent.set(curId, { ...pr, exercise_id: curId });
    }
  });

  const allTimeBests: Record<string, { weight: number; reps: number }[]> = {};
  const previousPerformance: Record<string, any[]> = {};

  const allLogs = logsRes.data as any[] | null;
  if (allLogs && allLogs.length > 0) {
    const byCurrent: Record<string, Record<string, { created_at: string; logs: any[] }>> = {};
    allLogs.forEach((l: any) => {
      const curId = siblingToCurrent.get(l.exercise_id);
      if (!curId) return;
      const sid = l.session_id;
      const sessionCreated = l.workout_sessions?.created_at || "";
      if (!byCurrent[curId]) byCurrent[curId] = {};
      if (!byCurrent[curId][sid]) byCurrent[curId][sid] = { created_at: sessionCreated, logs: [] };
      byCurrent[curId][sid].logs.push({ ...l, session_created_at: sessionCreated });

      const wLbs = toLbs(l.weight ?? 0, l.weight_unit || "lbs");
      const r = l.reps ?? 0;
      if (wLbs > 0 && r > 0) {
        if (!allTimeBests[curId]) allTimeBests[curId] = [];
        allTimeBests[curId].push({ weight: wLbs, reps: r });
      }
    });

    Object.entries(byCurrent).forEach(([curId, sessions]) => {
      const latestSession = Object.values(sessions).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];
      if (latestSession) {
        previousPerformance[curId] = latestSession.logs.sort(
          (a: any, b: any) => (a.set_number || 0) - (b.set_number || 0),
        );
      }
    });
  }

  return {
    previousPerformance,
    allTimeBests,
    personalRecords: Array.from(prByCurrent.values()),
  };
}
