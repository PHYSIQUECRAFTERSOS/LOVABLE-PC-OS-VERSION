/**
 * Shared deep-copy helpers for cloning a program phase into:
 *   - another client's active program
 *   - one of the coach's master programs (appended at the end)
 *
 * Both flows clone phase + workouts + exercises + sets sequentially via
 * the existing cloneWorkoutWithExercises helper, which preserves the
 * coach-authoritative source-of-truth and emits per-workout result rows
 * for accurate import-summary toasts.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  cloneWorkoutWithExercises,
  buildImportSummary,
  formatImportSummary,
  type CloneWorkoutResult,
} from "@/lib/cloneWorkoutHelpers";

interface PhaseSnapshot {
  id: string;
  name: string;
  description?: string | null;
  duration_weeks: number;
  training_style?: string | null;
  intensity_system?: string | null;
  custom_intensity?: string | null;
  progression_rule?: string | null;
}

interface CopyResult {
  ok: boolean;
  summary: ReturnType<typeof buildImportSummary>;
  message: ReturnType<typeof formatImportSummary>;
  newPhaseId?: string;
  error?: string;
}

/**
 * Append a deep copy of `sourcePhase` (with all its workouts) to a target
 * MASTER program owned by `coachId`. Source phase's workouts are cloned
 * as new workouts owned by the coach (is_template=true so they live in the master).
 */
export async function copyPhaseToMasterProgram(args: {
  coachId: string;
  sourcePhase: PhaseSnapshot;
  targetMasterProgramId: string;
}): Promise<CopyResult> {
  const { coachId, sourcePhase, targetMasterProgramId } = args;
  const allCloneResults: CloneWorkoutResult[] = [];

  try {
    // 1. Determine next phase_order in target program.
    const { data: existing } = await supabase
      .from("program_phases")
      .select("phase_order")
      .eq("program_id", targetMasterProgramId)
      .order("phase_order", { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.phase_order || 0) + 1;

    // 2. Insert the new phase.
    const { data: newPhase, error: phaseErr } = await supabase
      .from("program_phases")
      .insert({
        program_id: targetMasterProgramId,
        name: sourcePhase.name,
        description: sourcePhase.description || null,
        phase_order: nextOrder,
        duration_weeks: sourcePhase.duration_weeks,
        training_style: sourcePhase.training_style || null,
        intensity_system: sourcePhase.intensity_system || null,
        custom_intensity: sourcePhase.custom_intensity || null,
        progression_rule: sourcePhase.progression_rule || null,
      })
      .select("id")
      .single();
    if (phaseErr || !newPhase) throw phaseErr || new Error("Failed to create phase");

    // 3. Fetch source workouts.
    const { data: sourcePws } = await supabase
      .from("program_workouts")
      .select("workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
      .eq("phase_id", sourcePhase.id)
      .order("sort_order");

    // 4. Clone each workout as a TEMPLATE workout (master library) and link.
    for (const pw of sourcePws || []) {
      const { workout: clonedW, result } = await cloneWorkoutWithExercises(
        pw.workout_id,
        coachId,
        undefined, // no client_id → master template
        true       // is_template
      );
      allCloneResults.push(result);
      if (!clonedW) continue;
      await supabase.from("program_workouts").insert({
        phase_id: newPhase.id,
        workout_id: clonedW.id,
        day_of_week: pw.day_of_week,
        day_label: pw.day_label,
        sort_order: pw.sort_order,
        exclude_from_numbering: pw.exclude_from_numbering || false,
        custom_tag: pw.custom_tag || null,
      });
    }

    // 5. Bump master program duration_weeks.
    const { data: allPhases } = await supabase
      .from("program_phases")
      .select("duration_weeks")
      .eq("program_id", targetMasterProgramId);
    const totalWeeks = (allPhases || []).reduce((s, p: any) => s + (p.duration_weeks || 0), 0);
    await supabase.from("programs").update({ duration_weeks: totalWeeks } as any).eq("id", targetMasterProgramId);

    const summary = buildImportSummary(allCloneResults);
    return { ok: true, summary, message: formatImportSummary(summary), newPhaseId: newPhase.id };
  } catch (err: any) {
    const summary = buildImportSummary(allCloneResults);
    return {
      ok: false,
      summary,
      message: formatImportSummary(summary),
      error: err?.message || "Unknown error",
    };
  }
}

/**
 * Append a deep copy of `sourcePhase` to the target client's CURRENT active
 * program (workouts cloned as client-scoped, non-template).
 *
 * Returns ok=false with a clear error if the target client has no active program.
 */
export async function copyPhaseToClientProgram(args: {
  coachId: string;
  sourcePhase: PhaseSnapshot;
  targetClientId: string;
}): Promise<CopyResult> {
  const { coachId, sourcePhase, targetClientId } = args;
  const allCloneResults: CloneWorkoutResult[] = [];

  try {
    // 1. Find target client's active assignment + program_id.
    const { data: assignments } = await supabase
      .from("client_program_assignments")
      .select("program_id")
      .eq("client_id", targetClientId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    const targetProgramId = assignments?.[0]?.program_id;
    if (!targetProgramId) {
      return {
        ok: false,
        summary: buildImportSummary([]),
        message: { title: "No active program", description: "Target client has no active program. Assign one first.", isWarning: true } as any,
        error: "Target client has no active program. Assign one first.",
      };
    }

    // 2. Determine next phase_order.
    const { data: existing } = await supabase
      .from("program_phases")
      .select("phase_order")
      .eq("program_id", targetProgramId)
      .order("phase_order", { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.phase_order || 0) + 1;

    // 3. Insert phase.
    const { data: newPhase, error: phaseErr } = await supabase
      .from("program_phases")
      .insert({
        program_id: targetProgramId,
        name: sourcePhase.name,
        description: sourcePhase.description || null,
        phase_order: nextOrder,
        duration_weeks: sourcePhase.duration_weeks,
        training_style: sourcePhase.training_style || null,
        intensity_system: sourcePhase.intensity_system || null,
        custom_intensity: sourcePhase.custom_intensity || null,
        progression_rule: sourcePhase.progression_rule || null,
      })
      .select("id")
      .single();
    if (phaseErr || !newPhase) throw phaseErr || new Error("Failed to create phase");

    // 4. Clone source workouts to client.
    const { data: sourcePws } = await supabase
      .from("program_workouts")
      .select("workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
      .eq("phase_id", sourcePhase.id)
      .order("sort_order");

    for (const pw of sourcePws || []) {
      const { workout: clonedW, result } = await cloneWorkoutWithExercises(
        pw.workout_id,
        coachId,
        targetClientId,
        false // client-scoped, not a template
      );
      allCloneResults.push(result);
      if (!clonedW) continue;
      await supabase.from("program_workouts").insert({
        phase_id: newPhase.id,
        workout_id: clonedW.id,
        day_of_week: pw.day_of_week,
        day_label: pw.day_label,
        sort_order: pw.sort_order,
        exclude_from_numbering: pw.exclude_from_numbering || false,
        custom_tag: pw.custom_tag || null,
      });
    }

    // 5. Update target program total weeks.
    const { data: allPhases } = await supabase
      .from("program_phases")
      .select("duration_weeks")
      .eq("program_id", targetProgramId);
    const totalWeeks = (allPhases || []).reduce((s, p: any) => s + (p.duration_weeks || 0), 0);
    await supabase.from("programs").update({ duration_weeks: totalWeeks } as any).eq("id", targetProgramId);

    const summary = buildImportSummary(allCloneResults);
    return { ok: true, summary, message: formatImportSummary(summary), newPhaseId: newPhase.id };
  } catch (err: any) {
    const summary = buildImportSummary(allCloneResults);
    return {
      ok: false,
      summary,
      message: formatImportSummary(summary),
      error: err?.message || "Unknown error",
    };
  }
}
