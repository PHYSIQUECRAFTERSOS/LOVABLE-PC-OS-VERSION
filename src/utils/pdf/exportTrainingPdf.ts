import { supabase } from "@/integrations/supabase/client";
import {
  createBrandedDoc, drawCoverPage, newContentPage, drawSectionTitle, drawParagraph,
  pcTable, finalizePages, savePdf, nameSlug, todayStamp, PAGE, PC_GOLD, PC_MUTED, PC_LINE, PC_BLACK,
  type PdfSaveResult,
} from "./brandedPdf";
import { loadClientContext } from "./pdfShared";
import { estimateWorkoutMinutes } from "@/lib/workoutMeta";
import { derivePhaseDates, type PhaseLike } from "@/lib/phaseDates";

type ExportWorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_order: number | null;
  sets: number | null;
  reps: string | null;
  tempo: string | null;
  rest_seconds: number | null;
  rir: number | null;
  notes: string | null;
  superset_group: string | null;
  intensity_type: string | null;
  loading_type: string | null;
  loading_percentage: number | null;
  rpe_target: number | null;
  is_amrap: boolean | null;
  exerciseName?: string;
};

export async function exportTrainingPdf(clientId: string, opts: { preWin?: Window | null; returnAsset?: boolean } = {}): Promise<{ ok: boolean; reason?: string; saveResult?: PdfSaveResult }> {
  const ctx = await loadClientContext(clientId);

  // 1. Active assignment
  const { data: assign } = await supabase
    .from("client_program_assignments")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assign) return { ok: false, reason: "No active program assigned." };

  // 2. Program
  const { data: program } = await supabase
    .from("programs")
    .select("id, name, description, goal_type, duration_weeks, start_date, end_date")
    .eq("id", assign.program_id)
    .maybeSingle();

  if (!program) return { ok: false, reason: "Program not found." };

  // 3. Phases
  const { data: phases } = await supabase
    .from("program_phases")
    .select("*")
    .eq("program_id", program.id)
    .order("phase_order");

  const phaseList = (phases || []).slice().sort(
    (a: any, b: any) => (a.phase_order ?? 0) - (b.phase_order ?? 0),
  );
  if (!phaseList.length) return { ok: false, reason: "Program has no phases yet." };

  // Resolve THE current phase (mirrors TrainingTab/CalendarTab rules):
  //   1. Date-derived isCurrent
  //   2. assignment.current_phase_id if still present
  //   3. First non-completed phase in phase_order
  //   4. Last phase (program fully ended)
  const derived = derivePhaseDates(program.start_date, phaseList as PhaseLike[]);
  const currentPhase =
    phaseList.find((p: any) => derived[p.id]?.isCurrent) ||
    phaseList.find((p: any) => p.id === (assign as any).current_phase_id) ||
    phaseList.find((p: any) => !derived[p.id]?.isCompleted) ||
    phaseList[phaseList.length - 1];

  if (!currentPhase) return { ok: false, reason: "No current training phase found." };

  const phaseIds = [currentPhase.id];
  const phasePositionIndex = phaseList.findIndex((p: any) => p.id === currentPhase.id) + 1;

  // 3b. Weeks belonging to the current phase
  const { data: weeks } = await supabase
    .from("program_weeks")
    .select("id, phase_id, week_number")
    .eq("phase_id", currentPhase.id);

  const weekPhaseMap = new Map<string, string>();
  (weeks || []).forEach((w: any) => {
    weekPhaseMap.set(w.id, w.phase_id);
  });
  const weekIds = (weeks || []).map((w: any) => w.id);

  // 4. Workouts for the current phase — attached via phase_id OR week_id
  const orFilter = [
    `phase_id.in.(${phaseIds.join(",")})`,
    weekIds.length ? `week_id.in.(${weekIds.join(",")})` : null,
  ].filter(Boolean).join(",");

  const { data: programWorkouts } = await supabase
    .from("program_workouts")
    .select("id, phase_id, week_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(id, name, description, notes, is_accessory, estimated_duration)")
    .or(orFilter)
    .order("sort_order");

  const workoutIds = (programWorkouts || []).map((pw: any) => pw.workout_id).filter(Boolean);

  // 5. Exercises for each workout.
  // Keep this as two flat queries. The previous nested exercises(...) join can
  // trigger statement timeouts on exports because RLS has to evaluate the join
  // path for every workout exercise row.
  const { data: workoutExerciseRows, error: workoutExercisesError } = workoutIds.length
    ? await supabase
        .from("workout_exercises")
        .select("id, workout_id, exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, superset_group, intensity_type, loading_type, loading_percentage, rpe_target, is_amrap")
        .in("workout_id", workoutIds)
        .order("workout_id")
        .order("exercise_order")
    : { data: [] as ExportWorkoutExercise[], error: null };

  if (workoutExercisesError) {
    console.error("[exportTrainingPdf] workout exercises error:", workoutExercisesError);
    return { ok: false, reason: "Could not load workout exercises for this phase." };
  }

  const workoutExercises = (workoutExerciseRows || []) as ExportWorkoutExercise[];
  const exerciseIds = [...new Set(workoutExercises.map((we) => we.exercise_id).filter(Boolean))];
  const exerciseNameMap = new Map<string, string>();

  if (exerciseIds.length > 0) {
    const { data: exerciseRows, error: exercisesError } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", exerciseIds);

    if (exercisesError) {
      console.error("[exportTrainingPdf] exercises lookup error:", exercisesError);
      return { ok: false, reason: "Could not load exercise names for this phase." };
    }

    (exerciseRows || []).forEach((exercise: any) => {
      exerciseNameMap.set(exercise.id, exercise.name || "Exercise");
    });
  }

  const exByWorkout = new Map<string, any[]>();
  for (const we of workoutExercises) {
    if (!exByWorkout.has(we.workout_id)) exByWorkout.set(we.workout_id, []);
    exByWorkout.get(we.workout_id)!.push({
      ...we,
      exerciseName: exerciseNameMap.get(we.exercise_id) || "Exercise",
    });
  }

  // Build PDF
  const doc = createBrandedDoc();
  drawCoverPage(doc, {
    title: "Training Program",
    subtitle: program.name,
    clientName: ctx.clientName,
    coachName: ctx.coachName,
  });

  const resolvePhaseId = (pw: any): string | undefined =>
    pw.phase_id || (pw.week_id ? weekPhaseMap.get(pw.week_id) : undefined);

  {
    const phase: any = currentPhase;
    let y = newContentPage(doc);
    y = drawSectionTitle(doc, `Phase ${phasePositionIndex}: ${phase.name}`, y);

    const metaBits = [
      phase.duration_weeks ? `${phase.duration_weeks} weeks` : null,
      phase.training_style ? `Style: ${phase.training_style}` : null,
      phase.intensity_system ? `Intensity: ${phase.intensity_system}` : null,
      phase.progression_rule ? `Progression: ${phase.progression_rule}` : null,
    ].filter(Boolean).join("  •  ");
    if (metaBits) y = drawParagraph(doc, metaBits, y, { color: [120, 120, 120], size: 9 });
    if (phase.description) y = drawParagraph(doc, phase.description, y);

    const phaseWorkouts = (programWorkouts || [])
      .filter((pw: any) => resolvePhaseId(pw) === phase.id)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    let dayCounter = 0;
    for (const pw of phaseWorkouts) {
      const w: any = pw.workouts || {};
      const isAccessory = !!w.is_accessory || pw.exclude_from_numbering;
      let title = w.name || "Workout";
      if (isAccessory) {
        title = `Accessory — ${title.replace(/^Day\s*\d+\s*[:\-]\s*/i, "")}`;
      } else {
        dayCounter++;
        const clean = title.replace(/^Day\s*\d+\s*[:\-]\s*/i, "");
        title = `Day ${dayCounter}: ${clean}`;
      }

      const exercises = (exByWorkout.get(pw.workout_id) || []).sort(
        (a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0),
      );

      // Estimate space needed: header + table (approx 22pt per row + 26pt head)
      const estHeight = 44 + 26 + exercises.length * 22 + (w.notes ? 40 : 0);
      if (y > PAGE.height - PAGE.marginBottom - Math.min(estHeight, 180)) {
        y = newContentPage(doc);
      }

      // Day card: gold left rule + light border
      const cardTop = y - 6;
      const cardLeft = PAGE.marginX - 2;
      const cardWidth = PAGE.width - PAGE.marginX * 2 + 4;

      // Header row
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...PC_BLACK);
      doc.text(title, PAGE.marginX + 8, y + 6);

      const estMin = w.estimated_duration || estimateWorkoutMinutes(
        exercises.map((e: any) => ({ sets: e.sets, rest_seconds: e.rest_seconds })),
      );
      const metaChip = `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}${estMin ? `  •  est ${estMin} min` : ""}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...PC_MUTED);
      doc.text(metaChip, PAGE.width - PAGE.marginX - 4, y + 6, { align: "right" });

      y += 18;

      if (!exercises.length) {
        y = drawParagraph(doc, "No exercises defined.", y, { color: [150, 150, 150], size: 9 });
      } else {
        // Group by superset_group for row prefix; also compute display name with SS block indicator
        const body = exercises.map((we: any) => {
          const name = we.exerciseName || "Exercise";
          const ssPrefix = we.superset_group ? `SS ${we.superset_group}  ` : "";
          const intensity =
            we.loading_type === "percentage" && we.loading_percentage
              ? `${we.loading_percentage}%`
              : we.rpe_target
              ? `RPE ${we.rpe_target}`
              : we.rir != null
              ? `RIR ${we.rir}`
              : "—";
          const rest = we.rest_seconds ? `${Math.round(we.rest_seconds / 15) * 15}s` : "—";
          return [
            `${ssPrefix}${name}`,
            `${we.sets ?? "—"}`,
            we.reps || "—",
            we.tempo || "—",
            intensity,
            rest,
            we.notes || "",
          ];
        });

        y = pcTable(doc, y, {
          head: [["Exercise", "Sets", "Reps", "Tempo", "Intensity", "Rest", "Notes"]],
          body,
          columnStyles: {
            0: { cellWidth: 158, fontStyle: "bold" },
            1: { cellWidth: 30, halign: "center" },
            2: { cellWidth: 50, halign: "center" },
            3: { cellWidth: 38, halign: "center" },
            4: { cellWidth: 50, halign: "center" },
            5: { cellWidth: 36, halign: "center" },
            6: { cellWidth: "auto" },
          },
        });
      }

      if (w.notes) {
        // Coach notes callout
        const noteLines = doc.splitTextToSize(`Coach Notes: ${w.notes}`, PAGE.width - PAGE.marginX * 2 - 16);
        const noteHeight = noteLines.length * 11 + 12;
        if (y + noteHeight > PAGE.height - PAGE.marginBottom) y = newContentPage(doc);
        doc.setFillColor(250, 246, 232); // soft gold tint
        doc.setDrawColor(...PC_GOLD);
        doc.setLineWidth(0.5);
        doc.roundedRect(PAGE.marginX, y - 4, PAGE.width - PAGE.marginX * 2, noteHeight, 3, 3, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(noteLines, PAGE.marginX + 8, y + 6);
        y += noteHeight + 6;
      }

      // Gold left rule for the day block
      doc.setDrawColor(...PC_GOLD);
      doc.setLineWidth(2);
      doc.line(cardLeft, cardTop, cardLeft, y - 4);

      // Subtle separator line
      doc.setDrawColor(...PC_LINE);
      doc.setLineWidth(0.3);
      doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
      y += 12;
    }
  }

  finalizePages(doc, { clientName: ctx.clientName, coverFirstPage: true });
  const saveResult = await savePdf(doc, `${nameSlug(ctx.clientName)}-TrainingProgram-${todayStamp()}.pdf`, opts);
  return { ok: true, saveResult };
}
