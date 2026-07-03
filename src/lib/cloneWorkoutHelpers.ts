import { supabase } from "@/integrations/supabase/client";
import { fetchWorkoutExerciseDetails, replaceWorkoutExercisePlan } from "@/lib/workoutExerciseQueries";

/**
 * Result of cloning a single workout (day) with its exercises.
 */
export interface CloneWorkoutResult {
  workoutId: string;
  workoutName: string;
  exercisesExpected: number;
  exercisesCopied: number;
  errors: string[];
}

/**
 * Summary returned after a full program import.
 */
export interface ImportSummary {
  totalDays: number;
  totalExercises: number;
  daysMismatched: { dayName: string; expected: number; copied: number }[];
  errors: string[];
}

/**
 * Clones a single workout (with all exercises) to a client.
 * Uses sequential inserts with full error checking — no batch inserts.
 */
export async function cloneWorkoutWithExercises(
  sourceWorkoutId: string,
  coachId: string,
  clientId?: string,
  isTemplate = false,
): Promise<{ workout: any | null; result: CloneWorkoutResult }> {
  const emptyResult: CloneWorkoutResult = {
    workoutId: sourceWorkoutId,
    workoutName: "Unknown",
    exercisesExpected: 0,
    exercisesCopied: 0,
    errors: [],
  };

  // 1. Read source workout
  const { data: origW, error: origErr } = await supabase
    .from("workouts")
    .select("name, description, instructions, phase, workout_type")
    .eq("id", sourceWorkoutId)
    .single();

  if (origErr || !origW) {
    return {
      workout: null,
      result: { ...emptyResult, errors: [`Failed to read source workout: ${origErr?.message || "not found"}`] },
    };
  }

  emptyResult.workoutName = origW.name || "Workout";

  // 2. Insert client workout
  const insertPayload: any = {
    coach_id: coachId,
    name: origW.name,
    description: origW.description,
    instructions: origW.instructions,
    phase: origW.phase,
    is_template: isTemplate,
    workout_type: (origW as any).workout_type || "regular",
    source_workout_id: sourceWorkoutId,
  };
  if (clientId) insertPayload.client_id = clientId;

  const { data: clientW, error: insertErr } = await supabase
    .from("workouts")
    .insert(insertPayload)
    .select()
    .single();

  if (insertErr || !clientW) {
    return {
      workout: null,
      result: {
        ...emptyResult,
        errors: [`Failed to create workout "${origW.name}": ${insertErr?.message || "no data returned"}`],
      },
    };
  }

  // 3. Read source exercises through the optimized workout RPC. This avoids
  // RLS-heavy direct table reads that can time out for coaches on desktop.
  let exercises: Awaited<ReturnType<typeof fetchWorkoutExerciseDetails>> = [];
  try {
    exercises = await fetchWorkoutExerciseDetails(sourceWorkoutId);
  } catch (exeReadErr: any) {
    return {
      workout: clientW,
      result: {
        ...emptyResult,
        workoutId: clientW.id,
        errors: [`Failed to read exercises for "${origW.name}": ${exeReadErr.message}`],
      },
    };
  }

  emptyResult.exercisesExpected = exercises.length;

  if (exercises.length === 0) {
    return {
      workout: clientW,
      result: { ...emptyResult, workoutId: clientW.id },
    };
  }

  const errors: string[] = [];

  try {
    await replaceWorkoutExercisePlan({
      workoutId: clientW.id,
      name: origW.name || "Workout",
      instructions: origW.instructions || null,
      isAccessory: null,
      exercises: exercises.map((ex, index) => ({
        exercise_id: ex.exercise_id,
        exercise_order: ex.exercise_order ?? index + 1,
        sets: ex.sets || 3,
        reps: ex.reps || null,
        tempo: ex.tempo || null,
        rest_seconds: ex.rest_seconds ?? null,
        rir: ex.rir ?? null,
        rpe_target: ex.rpe_target ?? null,
        notes: ex.notes || null,
        superset_group: null,
        grouping_type: ex.grouping_type || null,
        grouping_id: ex.grouping_id || null,
      })),
    });
  } catch (copyErr: any) {
    errors.push(`Failed to copy exercises for "${origW.name}": ${copyErr.message}`);
  }


  return {
    workout: clientW,
    result: {
      workoutId: clientW.id,
      workoutName: origW.name || "Workout",
      exercisesExpected: exercises.length,
      exercisesCopied: errors.length === 0 ? exercises.length : 0,
      errors,
    },
  };
}

/**
 * Builds an import summary from an array of clone results.
 */
export function buildImportSummary(results: CloneWorkoutResult[]): ImportSummary {
  const totalDays = results.length;
  const totalExercises = results.reduce((s, r) => s + r.exercisesCopied, 0);
  const daysMismatched = results
    .filter(r => r.exercisesCopied !== r.exercisesExpected)
    .map(r => ({ dayName: r.workoutName, expected: r.exercisesExpected, copied: r.exercisesCopied }));
  const errors = results.flatMap(r => r.errors);

  return { totalDays, totalExercises, daysMismatched, errors };
}

/**
 * Formats an import summary into a human-readable description for a toast.
 */
export function formatImportSummary(summary: ImportSummary): { title: string; description: string; isWarning: boolean } {
  if (summary.daysMismatched.length === 0 && summary.errors.length === 0) {
    return {
      title: "Program imported successfully",
      description: `${summary.totalDays} workout days with ${summary.totalExercises} total exercises.`,
      isWarning: false,
    };
  }

  const mismatchLines = summary.daysMismatched.map(
    d => `• ${d.dayName}: ${d.copied}/${d.expected} exercises`
  );
  const desc = [
    `${summary.totalDays} days imported, ${summary.totalExercises} exercises copied.`,
    ...(mismatchLines.length > 0 ? ["", "⚠️ Incomplete days:", ...mismatchLines] : []),
    ...(summary.errors.length > 0 ? [``, `${summary.errors.length} error(s) occurred.`] : []),
  ].join("\n");

  return {
    title: "Import completed with warnings",
    description: desc,
    isWarning: true,
  };
}

/**
 * Shared routine — deep copies one or more master workouts into a client's
 * specific program phase. Each clone gets a fresh workouts row + exercises,
 * with no FK back to the source. New program_workouts rows are appended
 * to the end of the target phase using the next available sort_order.
 *
 * Used by:
 *   - Client Profile → Training → Import → Master Library (multi-select)
 *   - Master Libraries → Programs → Day "..." → Copy Day to Client (single)
 */
export async function importMasterWorkoutsToClientPhase(params: {
  coachId: string;
  clientId: string;
  targetPhaseId: string;
  sourceWorkoutIds: string[];
}): Promise<{
  successCount: number;
  failureCount: number;
  results: CloneWorkoutResult[];
  insertedProgramWorkoutIds: string[];
}> {
  const { coachId, clientId, targetPhaseId, sourceWorkoutIds } = params;
  const { supabase } = await import("@/integrations/supabase/client");

  // Resolve trailing sort_order once
  const { data: existing } = await supabase
    .from("program_workouts")
    .select("sort_order")
    .eq("phase_id", targetPhaseId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let nextSort = ((existing?.[0]?.sort_order ?? -1) + 1);

  const results: CloneWorkoutResult[] = [];
  const insertedProgramWorkoutIds: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  // Look up source metadata in parallel for day_of_week / day_label / flags
  const sourceMeta = await Promise.allSettled(
    sourceWorkoutIds.map(async (wid) => {
      const { data } = await supabase
        .from("program_workouts")
        .select("day_of_week, day_label, exclude_from_numbering, custom_tag")
        .eq("workout_id", wid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return { wid, meta: data };
    })
  );
  const metaByWid: Record<string, any> = {};
  for (const r of sourceMeta) {
    if (r.status === "fulfilled" && r.value?.meta) metaByWid[r.value.wid] = r.value.meta;
  }

  // Sequential cloning to avoid hammering RLS / racing inserts
  for (const sourceWid of sourceWorkoutIds) {
    const { workout, result } = await cloneWorkoutWithExercises(sourceWid, coachId, clientId, false);
    results.push(result);
    if (!workout) { failureCount++; continue; }

    const meta = metaByWid[sourceWid] || {};
    const { data: pw, error: pwErr } = await supabase
      .from("program_workouts")
      .insert({
        phase_id: targetPhaseId,
        workout_id: workout.id,
        day_of_week: meta.day_of_week ?? 0,
        day_label: meta.day_label || workout.name,
        sort_order: nextSort,
        exclude_from_numbering: meta.exclude_from_numbering || false,
        custom_tag: meta.custom_tag || null,
      })
      .select()
      .single();

    if (pwErr || !pw) {
      result.errors.push(`Failed to attach workout to phase: ${pwErr?.message || "unknown"}`);
      failureCount++;
    } else {
      insertedProgramWorkoutIds.push(pw.id);
      nextSort++;
      successCount++;
    }
  }

  return { successCount, failureCount, results, insertedProgramWorkoutIds };
}
