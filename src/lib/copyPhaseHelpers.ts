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

/**
 * Deep-duplicate a phase IN PLACE within the same client program.
 * Clones the phase row and every attached workout (with all exercises/sets)
 * via cloneWorkoutWithExercises. New workouts are client-scoped (is_template=false).
 */
export async function duplicatePhaseInPlace(args: {
  coachId: string;
  clientId: string;
  sourcePhase: PhaseSnapshot;
  programId: string;
  /** Overrides (Trainerize-style "Save Training Phase As" dialog). */
  nameOverride?: string;
  durationWeeksOverride?: number;
}): Promise<CopyResult> {
  const { coachId, clientId, sourcePhase, programId } = args;
  const allCloneResults: CloneWorkoutResult[] = [];

  try {
    // 1. Next phase_order in this program.
    const { data: existing } = await supabase
      .from("program_phases")
      .select("phase_order")
      .eq("program_id", programId)
      .order("phase_order", { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.phase_order || 0) + 1;

    const finalName = args.nameOverride?.trim() || `${sourcePhase.name} (Copy)`;
    const finalWeeks = args.durationWeeksOverride ?? sourcePhase.duration_weeks;

    // 2. Insert new phase row.
    const { data: newPhase, error: phaseErr } = await supabase
      .from("program_phases")
      .insert({
        program_id: programId,
        name: finalName,
        description: sourcePhase.description || null,
        phase_order: nextOrder,
        duration_weeks: finalWeeks,
        training_style: sourcePhase.training_style || null,
        intensity_system: sourcePhase.intensity_system || null,
        custom_intensity: sourcePhase.custom_intensity || null,
        progression_rule: sourcePhase.progression_rule || null,
      })
      .select("id")
      .single();
    if (phaseErr || !newPhase) throw phaseErr || new Error("Failed to create phase");

    // 3. Fetch source workouts, clone in PARALLEL (Trainerize-fast), then
    //    bulk-insert program_workouts join rows in a single call.
    const { data: sourcePws } = await supabase
      .from("program_workouts")
      .select("workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
      .eq("phase_id", sourcePhase.id)
      .order("sort_order");

    const cloneOutcomes = await Promise.all(
      (sourcePws || []).map((pw) =>
        cloneWorkoutWithExercises(pw.workout_id, coachId, clientId, false)
          .then(({ workout, result }) => ({ pw, workout, result }))
          .catch((err) => ({
            pw,
            workout: null as any,
            result: {
              workoutId: pw.workout_id,
              workoutName: "unknown",
              exercisesExpected: 0,
              exercisesCopied: 0,
              errors: [err?.message || "clone failed"],
            } as CloneWorkoutResult,
          }))
      )
    );


    const joinRows: any[] = [];
    for (const { pw, workout, result } of cloneOutcomes) {
      allCloneResults.push(result);
      if (!workout) continue;
      joinRows.push({
        phase_id: newPhase.id,
        workout_id: workout.id,
        day_of_week: pw.day_of_week,
        day_label: pw.day_label,
        sort_order: pw.sort_order,
        exclude_from_numbering: pw.exclude_from_numbering || false,
        custom_tag: pw.custom_tag || null,
      });
    }
    if (joinRows.length > 0) {
      await supabase.from("program_workouts").insert(joinRows);
    }

    // 4. Recompute program total weeks.
    const { data: allPhases } = await supabase
      .from("program_phases")
      .select("duration_weeks")
      .eq("program_id", programId);
    const totalWeeks = (allPhases || []).reduce((s, p: any) => s + (p.duration_weeks || 0), 0);
    await supabase.from("programs").update({ duration_weeks: totalWeeks } as any).eq("id", programId);

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
 * Restore an archived/previous program by appending each of its phases (in order)
 * to the target client's CURRENT active program. The source program is left
 * untouched (still status='completed' in client_program_assignments).
 *
 * Returns ok=false with a clear message if the target client has no active program
 * or the source program has no phases.
 */
export async function restorePreviousProgramPhases(args: {
  coachId: string;
  sourceProgramId: string;
  targetClientId: string;
}): Promise<CopyResult & { phasesRestored: number }> {
  const { coachId, sourceProgramId, targetClientId } = args;

  // Verify target has an active program first (cheap check, gives a clean error).
  const { data: activeAssign } = await supabase
    .from("client_program_assignments")
    .select("program_id")
    .eq("client_id", targetClientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (!activeAssign?.[0]?.program_id) {
    return {
      ok: false,
      summary: buildImportSummary([]),
      message: { title: "No active program", description: "Assign an active program to this client first.", isWarning: true } as any,
      error: "No active program",
      phasesRestored: 0,
    };
  }

  // Load source phases in order.
  const { data: phases } = await supabase
    .from("program_phases")
    .select("id, name, description, duration_weeks, training_style, intensity_system, custom_intensity, progression_rule, phase_order")
    .eq("program_id", sourceProgramId)
    .order("phase_order");

  if (!phases || phases.length === 0) {
    return {
      ok: false,
      summary: buildImportSummary([]),
      message: { title: "Nothing to restore", description: "This previous program has no phases.", isWarning: true } as any,
      error: "Empty program",
      phasesRestored: 0,
    };
  }

  let restored = 0;
  let lastResult: CopyResult | null = null;
  for (const p of phases) {
    const res = await copyPhaseToClientProgram({
      coachId,
      targetClientId,
      sourcePhase: {
        id: p.id,
        name: p.name,
        description: (p as any).description,
        duration_weeks: p.duration_weeks,
        training_style: (p as any).training_style,
        intensity_system: (p as any).intensity_system,
        custom_intensity: (p as any).custom_intensity,
        progression_rule: (p as any).progression_rule,
      },
    });
    lastResult = res;
    if (res.ok) restored++;
  }

  const summary = lastResult?.summary || buildImportSummary([]);
  return {
    ok: restored > 0,
    summary,
    message: formatImportSummary(summary),
    phasesRestored: restored,
  };
}

/**
 * Create a brand-new one-phase program for a client that has no active program
 * yet (typical case: a coach copies a master-library phase to a pending,
 * invited-but-not-yet-onboarded client so the plan is ready on first login).
 *
 * - Clones the source phase's workouts as client-scoped (non-template) workouts.
 * - Inserts a `client_program_assignments` row with status='active' starting on
 *   `startDate` (YYYY-MM-DD). If the client already had another active program,
 *   `applyMerge` is used to truncate it cleanly before assigning the new one.
 */
export async function createSinglePhaseProgramForClient(args: {
  coachId: string;
  targetClientId: string;
  sourcePhase: PhaseSnapshot;
  /** YYYY-MM-DD; defaults to today (local). */
  startDate?: string;
  /** Optional program-level metadata. */
  programName?: string;
  programDescription?: string | null;
}): Promise<CopyResult> {
  const { coachId, targetClientId, sourcePhase } = args;
  const startDate = args.startDate || new Date().toLocaleDateString("en-CA");
  const allCloneResults: CloneWorkoutResult[] = [];

  try {
    // 1. Create program shell.
    const { data: newProg, error: progErr } = await supabase
      .from("programs")
      .insert({
        coach_id: coachId,
        name: args.programName || sourcePhase.name,
        description: args.programDescription ?? sourcePhase.description ?? null,
        duration_weeks: sourcePhase.duration_weeks,
        is_template: false,
        is_master: false,
        start_date: startDate,
      } as any)
      .select("id")
      .single();
    if (progErr || !newProg) throw progErr || new Error("Failed to create program");

    // 2. Create the phase.
    const { data: newPhase, error: phaseErr } = await supabase
      .from("program_phases")
      .insert({
        program_id: newProg.id,
        name: sourcePhase.name,
        description: sourcePhase.description || null,
        phase_order: 1,
        duration_weeks: sourcePhase.duration_weeks,
        training_style: sourcePhase.training_style || null,
        intensity_system: sourcePhase.intensity_system || null,
        custom_intensity: sourcePhase.custom_intensity || null,
        progression_rule: sourcePhase.progression_rule || null,
      })
      .select("id")
      .single();
    if (phaseErr || !newPhase) throw phaseErr || new Error("Failed to create phase");

    // 3. Clone source workouts → client-scoped (not template).
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
        false
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

    // 4. Truncate any prior overlapping program, then insert active assignment.
    const { applyMerge } = await import("@/lib/programMerge");
    await applyMerge(targetClientId, startDate);

    const { error: assignErr } = await supabase
      .from("client_program_assignments")
      .insert({
        client_id: targetClientId,
        coach_id: coachId,
        program_id: newProg.id,
        current_phase_id: newPhase.id,
        start_date: startDate,
        status: "active",
        current_week_number: 1,
        is_linked_to_master: false,
        master_version_number: 1,
      });
    if (assignErr) throw assignErr;

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

