/**
 * programMerge — Trainerize-style merge when subscribing/copying a program
 * (or single phase) to a client who already has an active program.
 *
 * Behavior (mirrors Trainerize):
 *   1. Find the client's current active assignment.
 *   2. Compute its derived end date from program_phases.
 *   3. If the new program's start date overlaps the old one:
 *        - Shorten the phase containing the new start so it ends the day
 *          before the new start.
 *        - Clear explicit start_date on every later phase so they cascade.
 *        - Mark the old assignment status='completed' with ended_on = newStart-1.
 *        - Delete ALL future calendar events on/after newStart that are
 *          linked to a workout from the OLD program.
 *   4. Caller (subscribe/import/copy-phase flows) then clones the new
 *      program and inserts its own client_program_assignments row.
 *
 * Coach Authority: only the OLD program's overlapping tail is touched.
 * Past history (completed sessions, calendar events before newStart) is
 * preserved untouched.
 */
import { supabase } from "@/integrations/supabase/client";
import { derivePhaseDates, type PhaseLike } from "@/lib/phaseDates";

export interface MergePreview {
  hasOverlap: boolean;
  oldAssignmentId: string | null;
  oldProgramId: string | null;
  oldProgramName: string | null;
  oldProgramStart: string | null;
  oldProgramEnd: string | null;
  futureEventCount: number;
  /** Phase id within the OLD program that contains newStart (will be shortened). */
  truncatedPhaseId: string | null;
  truncatedPhaseName: string | null;
  /** New duration_weeks the truncated phase will be set to (>=1). */
  newPhaseDurationWeeks: number | null;
}

/** Parse YYYY-MM-DD as a local-midnight Date (no UTC drift). */
function parseLocal(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}
function toLocalYMD(d: Date): string {
  return d.toLocaleDateString("en-CA");
}
function addDays(ymd: string, days: number): string {
  const d = parseLocal(ymd);
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}
function daysBetween(a: string, b: string): number {
  const ms = parseLocal(b).getTime() - parseLocal(a).getTime();
  return Math.round(ms / 86400000);
}

/**
 * Inspect the client's current program without mutating anything.
 * Use this to render warning text + future event count in the assign dialog.
 */
export async function previewMerge(
  clientId: string,
  newStart: string,
): Promise<MergePreview> {
  const empty: MergePreview = {
    hasOverlap: false,
    oldAssignmentId: null,
    oldProgramId: null,
    oldProgramName: null,
    oldProgramStart: null,
    oldProgramEnd: null,
    futureEventCount: 0,
    truncatedPhaseId: null,
    truncatedPhaseName: null,
    newPhaseDurationWeeks: null,
  };

  // 1. Active assignment
  const { data: assignRows } = await supabase
    .from("client_program_assignments")
    .select("id, program_id, programs:program_id(name, start_date)")
    .eq("client_id", clientId)
    .in("status", ["active", "subscribed"])
    .order("created_at", { ascending: false })
    .limit(1);

  const assignment = assignRows?.[0];
  if (!assignment) return empty;

  const programId = assignment.program_id as string;
  const programName = (assignment as any).programs?.name ?? null;
  const programStart = (assignment as any).programs?.start_date as string | null;

  // 2. Phases + derived dates
  const { data: phaseRows } = await supabase
    .from("program_phases")
    .select("id, name, phase_order, duration_weeks, start_date")
    .eq("program_id", programId)
    .order("phase_order", { ascending: true });

  const phases = ((phaseRows as any[]) || []) as Array<PhaseLike & { name: string }>;
  if (!programStart || phases.length === 0) {
    return { ...empty, oldAssignmentId: assignment.id, oldProgramId: programId, oldProgramName: programName, oldProgramStart: programStart };
  }

  const derived = derivePhaseDates(programStart, phases);
  const lastPhase = phases[phases.length - 1];
  const oldEnd = derived[lastPhase.id]?.end_date ?? null;

  if (!oldEnd || newStart > oldEnd) {
    // No overlap — new program starts after current one ends.
    return {
      ...empty,
      oldAssignmentId: assignment.id,
      oldProgramId: programId,
      oldProgramName: programName,
      oldProgramStart: programStart,
      oldProgramEnd: oldEnd,
    };
  }

  // 3. Find phase containing newStart
  let truncatedPhase: (PhaseLike & { name: string }) | null = null;
  for (const p of phases) {
    const dp = derived[p.id];
    if (!dp?.start_date || !dp?.end_date) continue;
    if (newStart >= dp.start_date && newStart <= dp.end_date) {
      truncatedPhase = p;
      break;
    }
  }
  // If newStart is before the program start, truncate phase 1 to 0 (we'll
  // mark assignment completed instead — represented as duration 1 to keep the
  // NOT NULL/CHECK constraints happy, but we'll set ended_on = newStart-1).
  if (!truncatedPhase && newStart < (derived[phases[0].id]?.start_date ?? newStart)) {
    truncatedPhase = phases[0];
  }

  let newWeeks: number | null = null;
  if (truncatedPhase) {
    const dp = derived[truncatedPhase.id];
    if (dp?.start_date) {
      const days = daysBetween(dp.start_date, newStart); // newStart - phaseStart
      // weeks needed so phase ends at newStart - 1 → ceil(days / 7), min 1
      newWeeks = Math.max(1, Math.ceil(days / 7));
    }
  }

  // 4. Count future calendar events on/after newStart linked to OLD workouts
  let futureCount = 0;
  const { data: pwRows } = await supabase
    .from("program_workouts")
    .select("workout_id")
    .or(`phase_id.in.(${phases.map(p => `"${p.id}"`).join(",")})`);
  const oldWorkoutIds = Array.from(new Set((pwRows || []).map((r: any) => r.workout_id).filter(Boolean)));

  if (oldWorkoutIds.length > 0) {
    const { count } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("target_client_id", clientId)
      .gte("event_date", newStart)
      .in("linked_workout_id", oldWorkoutIds);
    futureCount = count || 0;
  }

  return {
    hasOverlap: true,
    oldAssignmentId: assignment.id,
    oldProgramId: programId,
    oldProgramName: programName,
    oldProgramStart: programStart,
    oldProgramEnd: oldEnd,
    futureEventCount: futureCount,
    truncatedPhaseId: truncatedPhase?.id ?? null,
    truncatedPhaseName: truncatedPhase?.name ?? null,
    newPhaseDurationWeeks: newWeeks,
  };
}

/**
 * Apply the merge: truncate old phase, cascade later phases, mark old
 * assignment completed, delete future calendar events. Call this BEFORE
 * inserting the new assignment row.
 *
 * If preview.hasOverlap is false, this is a no-op (returns early). The
 * caller is still responsible for marking any prior `status='active'`
 * assignments as `completed` when starting the new one — typically by
 * passing markRemainingCompleted=true.
 */
export async function applyMerge(
  clientId: string,
  newStart: string,
  preview?: MergePreview,
): Promise<{ truncated: boolean; deletedEvents: number; oldAssignmentId: string | null }> {
  const p = preview ?? (await previewMerge(clientId, newStart));

  if (!p.oldAssignmentId) {
    return { truncated: false, deletedEvents: 0, oldAssignmentId: null };
  }

  if (!p.hasOverlap) {
    // Old program ends before new start; just mark it completed so only one
    // assignment is "active" at a time. ended_on stays null = full duration.
    await supabase
      .from("client_program_assignments")
      .update({ status: "completed" } as any)
      .eq("id", p.oldAssignmentId);
    return { truncated: false, deletedEvents: 0, oldAssignmentId: p.oldAssignmentId };
  }

  // 1. Shorten the containing phase
  if (p.truncatedPhaseId && p.newPhaseDurationWeeks != null) {
    await supabase
      .from("program_phases")
      .update({ duration_weeks: p.newPhaseDurationWeeks } as any)
      .eq("id", p.truncatedPhaseId);

    // 2. Clear explicit start_date on later phases so derive cascades
    if (p.oldProgramId) {
      const { data: phaseRows } = await supabase
        .from("program_phases")
        .select("id, phase_order")
        .eq("program_id", p.oldProgramId)
        .order("phase_order", { ascending: true });
      const truncatedRow = (phaseRows || []).find((r: any) => r.id === p.truncatedPhaseId);
      const truncatedOrder = truncatedRow?.phase_order ?? 0;
      const laterIds = (phaseRows || [])
        .filter((r: any) => r.phase_order > truncatedOrder)
        .map((r: any) => r.id);
      if (laterIds.length > 0) {
        await supabase
          .from("program_phases")
          .update({ start_date: null } as any)
          .in("id", laterIds);
      }
    }
  }

  // 3. Mark old assignment completed with ended_on = newStart - 1
  const endedOn = addDays(newStart, -1);
  await supabase
    .from("client_program_assignments")
    .update({ status: "completed", ended_on: endedOn } as any)
    .eq("id", p.oldAssignmentId);

  // 4. Delete future calendar events linked to old workouts
  let deletedEvents = 0;
  if (p.oldProgramId) {
    const { data: phaseRows } = await supabase
      .from("program_phases")
      .select("id")
      .eq("program_id", p.oldProgramId);
    const phaseIds = (phaseRows || []).map((r: any) => r.id);
    if (phaseIds.length > 0) {
      const { data: pwRows } = await supabase
        .from("program_workouts")
        .select("workout_id")
        .in("phase_id", phaseIds);
      const oldWorkoutIds = Array.from(
        new Set((pwRows || []).map((r: any) => r.workout_id).filter(Boolean)),
      );
      if (oldWorkoutIds.length > 0) {
        const { data: deleted } = await supabase
          .from("calendar_events")
          .delete()
          .eq("target_client_id", clientId)
          .gte("event_date", newStart)
          .in("linked_workout_id", oldWorkoutIds)
          .select("id");
        deletedEvents = deleted?.length || 0;
      }
    }
  }

  return { truncated: true, deletedEvents, oldAssignmentId: p.oldAssignmentId };
}
