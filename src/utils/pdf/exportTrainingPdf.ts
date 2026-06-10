import { supabase } from "@/integrations/supabase/client";
import {
  createBrandedDoc, drawCoverPage, newContentPage, drawSectionTitle, drawParagraph,
  pcTable, finalizePages, savePdf, nameSlug, todayStamp, PAGE, type PdfSaveResult,
} from "./brandedPdf";
import { loadClientContext } from "./pdfShared";

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

  const phaseList = phases || [];
  if (!phaseList.length) return { ok: false, reason: "Program has no phases yet." };

  // 4. Workouts for all phases
  const phaseIds = phaseList.map((p: any) => p.id);
  const { data: programWorkouts } = await supabase
    .from("program_workouts")
    .select("id, phase_id, workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag, workouts(id, name, description, notes, is_accessory, estimated_duration)")
    .in("phase_id", phaseIds)
    .order("sort_order");

  const workoutIds = (programWorkouts || []).map((pw: any) => pw.workout_id);
  // 5. Exercises for each workout (join with exercises master for names)
  const { data: workoutExercises } = workoutIds.length
    ? await supabase
        .from("workout_exercises")
        .select("id, workout_id, exercise_id, exercise_order, sets, reps, tempo, rest_seconds, rir, notes, superset_group, intensity_type, loading_type, loading_percentage, rpe_target, is_amrap, exercises(id, name)")
        .in("workout_id", workoutIds)
        .order("exercise_order")
    : { data: [] as any[] };

  const exByWorkout = new Map<string, any[]>();
  for (const we of workoutExercises || []) {
    if (!exByWorkout.has(we.workout_id)) exByWorkout.set(we.workout_id, []);
    exByWorkout.get(we.workout_id)!.push(we);
  }

  // Build PDF
  const doc = createBrandedDoc();
  drawCoverPage(doc, {
    title: "Training Program",
    subtitle: program.name,
    clientName: ctx.clientName,
    coachName: ctx.coachName,
  });

  let phaseIndex = 0;
  for (const phase of phaseList) {
    phaseIndex++;
    let y = newContentPage(doc);
    y = drawSectionTitle(doc, `Phase ${phaseIndex}: ${phase.name}`, y);

    const metaBits = [
      phase.duration_weeks ? `${phase.duration_weeks} weeks` : null,
      phase.training_style ? `Style: ${phase.training_style}` : null,
      phase.intensity_system ? `Intensity: ${phase.intensity_system}` : null,
      phase.progression_rule ? `Progression: ${phase.progression_rule}` : null,
    ].filter(Boolean).join("  •  ");
    if (metaBits) y = drawParagraph(doc, metaBits, y, { color: [120, 120, 120], size: 9 });
    if (phase.description) y = drawParagraph(doc, phase.description, y);

    const phaseWorkouts = (programWorkouts || [])
      .filter((pw: any) => pw.phase_id === phase.id)
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
        // Strip any pre-baked "Day N:" prefix and apply our own numbering
        const clean = title.replace(/^Day\s*\d+\s*[:\-]\s*/i, "");
        title = `Day ${dayCounter}: ${clean}`;
      }

      if (y > PAGE.height - 180) y = newContentPage(doc);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      doc.text(title, PAGE.marginX, y);
      if (w.estimated_duration) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120, 120, 120);
        doc.text(`${w.estimated_duration} min`, PAGE.width - PAGE.marginX, y, { align: "right" });
      }
      y += 6;

      const exercises = (exByWorkout.get(pw.workout_id) || []).sort(
        (a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0),
      );

      if (!exercises.length) {
        y = drawParagraph(doc, "No exercises defined.", y + 6, { color: [150, 150, 150], size: 9 });
        continue;
      }

      const body = exercises.map((we: any) => {
        const name = we.exercises?.name || "Exercise";
        const ssTag = we.superset_group ? ` [SS ${we.superset_group}]` : "";
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
          `${name}${ssTag}`,
          `${we.sets ?? "—"}`,
          we.reps || "—",
          we.tempo || "—",
          intensity,
          rest,
          we.notes || "",
        ];
      });

      y = pcTable(doc, y + 4, {
        head: [["Exercise", "Sets", "Reps", "Tempo", "Intensity", "Rest", "Notes"]],
        body,
        columnStyles: {
          0: { cellWidth: 150, fontStyle: "bold" },
          1: { cellWidth: 32, halign: "center" },
          2: { cellWidth: 50, halign: "center" },
          3: { cellWidth: 45, halign: "center" },
          4: { cellWidth: 55, halign: "center" },
          5: { cellWidth: 40, halign: "center" },
          6: { cellWidth: "auto" },
        },
      });

      if (w.notes) {
        y = drawParagraph(doc, `Coach Notes: ${w.notes}`, y, { color: [110, 110, 110], size: 9 });
      }
    }
  }

  finalizePages(doc, { clientName: ctx.clientName, coverFirstPage: true });
  const saveResult = await savePdf(doc, `${nameSlug(ctx.clientName)}-TrainingProgram-${todayStamp()}.pdf`, opts);
  return { ok: true, saveResult };
}
