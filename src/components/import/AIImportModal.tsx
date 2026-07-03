import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ExerciseMatchReview from "./ExerciseMatchReview";
import FoodMatchReview from "./FoodMatchReview";
import SupplementReview from "./SupplementReview";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { prependTrainerizeWorkoutSummary } from "@/lib/ai-import/trainerizeWorkoutParser";
import { replaceWorkoutExercisePlan, type WorkoutExercisePlanInput } from "@/lib/workoutExerciseQueries";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function extractTextFromPDF(file: File, documentType?: string): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const rows: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
    for (const item of content.items as any[]) {
      const str = String(item.str || "").trim();
      if (!str) continue;
      const x = Number(item.transform?.[4] ?? 0);
      const y = Number(item.transform?.[5] ?? 0);
      let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
      if (!row) {
        row = { y, items: [] };
        rows.push(row);
      }
      row.items.push({ x, str });
    }
    const pageText = rows
      .sort((a, b) => b.y - a.y)
      .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.str).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    textParts.push(`--- Page ${i} ---\n${pageText}`);
  }
  const extractedText = textParts.join("\n");
  return documentType === "workout" ? prependTrainerizeWorkoutSummary(extractedText) : extractedText;
}

/**
 * Sanitize a filename for use as a Supabase Storage object key.
 * Storage rejects keys with brackets, leading/trailing whitespace, and many
 * other characters. We keep only [A-Za-z0-9._-], replace runs of anything
 * else with a single underscore, and trim leading/trailing underscores.
 * The original (unsanitized) filename is still stored in ai_import_jobs.file_names.
 */
function sanitizeStorageKey(name: string): string {
  const trimmed = name.trim();
  // Split off the last extension so we don't mangle it
  const lastDot = trimmed.lastIndexOf(".");
  const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const ext = lastDot > 0 ? trimmed.slice(lastDot) : "";
  const safeBase = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, "");
  const finalName = (safeBase || "file") + safeExt;
  return finalName;
}


type Step = "upload" | "processing" | "review" | "saving" | "done";

async function getFunctionErrorMessage(error: any): Promise<string> {
  const fallback = error?.message || "Processing failed";
  const response = error?.context;
  if (!response || typeof response.json !== "function") return fallback;

  try {
    const body = await response.json();
    return body?.message || body?.error || fallback;
  } catch {
    return fallback;
  }
}

interface AIImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryPoint: "library" | "client";
  clientId?: string;
  importType: "workout" | "meal" | "supplement" | "any";
  onImportComplete?: () => void;
  /**
   * Optional target for workout imports.
   * - "new-program" (default): create a brand-new program with one phase (legacy behavior).
   * - "append-phase": append a new auto-numbered phase to targetProgramId.
   * - "append-to-phase": append workouts to targetPhaseId (no new phase created).
   */
  targetMode?: "new-program" | "append-phase" | "append-to-phase";
  targetProgramId?: string;
  targetPhaseId?: string;
}

const AIImportModal = ({ open, onOpenChange, entryPoint, clientId, importType, onImportComplete, targetMode = "new-program", targetProgramId, targetPhaseId }: AIImportModalProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<string>(importType === "any" ? "workout" : importType);
  // Note: when targetProgramId/targetPhaseId are set, docType is locked to "workout" (see effectiveImportType below).
  const [jobId, setJobId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When targeting an existing program/phase, the import is always a workout doc
  const isTargetedWorkoutImport = !!(targetProgramId || targetPhaseId);
  const effectiveImportType = isTargetedWorkoutImport ? "workout" : importType;

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setFiles([]);
      setDocType(effectiveImportType === "any" ? "workout" : effectiveImportType);
      setJobId(null);
      setExtracted(null);
      setMatchResults(null);
      setError(null);
      setSaveProgress(0);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [open, effectiveImportType]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files).filter(
        (f) => f.type === "application/pdf" || f.type.startsWith("image/")
      );
      setFiles((prev) => [...prev, ...selected]);
    }
  }, []);

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const startProcessing = async () => {
    if (!user || files.length === 0) return;

    // Check file size limit (100MB total)
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 100 * 1024 * 1024) {
      setError("File too large. Please use a PDF under 100MB.");
      toast.error("File too large. Please use a PDF under 100MB.");
      return;
    }

    setStep("processing");
    setError(null);

    try {
      // Step 1: Create job record to get job ID
      const { data: job, error: jobErr } = await supabase
        .from("ai_import_jobs")
        .insert({
          created_by: user.id,
          client_id: clientId || null,
          status: "queued",
          document_type: docType,
          file_names: files.map((f) => f.name),
        } as any)
        .select()
        .single();

      if (jobErr || !job) throw new Error(jobErr?.message || "Failed to create job");
      const newJobId = (job as any).id;
      setJobId(newJobId);

      // Step 2: Upload files to storage (two-phase approach)
      // For PDFs: extract text client-side first, upload as .txt (avoids 27MB+ base64 to AI)
      // For images: upload as-is (small enough for AI gateway)
      const filePaths: string[] = [];
      for (const file of files) {
        let uploadBlob: Blob = file;
        let uploadName = file.name;

        if (file.type === "application/pdf") {
          toast.info("Extracting text from PDF...");
          const extractedText = await extractTextFromPDF(file, docType);
          console.log("Extracted text length:", extractedText.length, "characters");
          uploadBlob = new Blob([extractedText], { type: "text/plain" });
          uploadName = file.name.replace(/\.pdf$/i, ".txt");
        }

        const safeName = sanitizeStorageKey(uploadName);
        const storagePath = `${user.id}/${newJobId}/${safeName}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("ai-import-uploads")
          .upload(storagePath, uploadBlob, { upsert: true });

        if (uploadErr) {
          console.error("Storage upload error:", uploadErr, "path:", storagePath);
          await supabase
            .from("ai_import_jobs")
            .update({ status: "failed", error_message: `File upload failed: ${uploadErr.message}` } as any)
            .eq("id", newJobId);
          throw new Error(`File upload failed: ${uploadErr.message}`);
        }
        console.log("Uploaded to path:", uploadData.path);
        filePaths.push(`ai-import-uploads/${uploadData.path}`);
      }

      // Step 3: Call edge function with storage paths only (no base64)
      const { error: fnErr } = await supabase.functions.invoke("ai-import-processor", {
        body: {
          job_id: newJobId,
          file_paths: filePaths,
          document_type: docType,
        },
      });

      if (fnErr) throw new Error(await getFunctionErrorMessage(fnErr));

      // Step 4: Poll for completion
      pollRef.current = setInterval(async () => {
        const { data: jobData } = await supabase
          .from("ai_import_jobs")
          .select("status, extracted_json, match_results, error_message")
          .eq("id", newJobId)
          .single();

        if (!jobData) return;
        const jd = jobData as any;

        if (jd.status === "review") {
          if (pollRef.current) clearInterval(pollRef.current);
          setExtracted(jd.extracted_json);
          setMatchResults(jd.match_results);
          setStep("review");
        } else if (jd.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(jd.error_message || "Processing failed");
          setStep("upload");
        }
      }, 3000);
    } catch (err: any) {
      setError(err.message);
      setStep("upload");
      toast.error(err.message || "Import failed");
    }
  };

  const confirmAndSave = async () => {
    if (!user || !extracted || !jobId) return;
    setStep("saving");
    setSaveProgress(10);

    try {
      await supabase
        .from("ai_import_jobs")
        .update({ status: "importing", final_data: { extracted, matchResults } } as any)
        .eq("id", jobId);

      let successMsg = "Import complete!";
      if (docType === "workout") {
        const result = await saveWorkoutProgram();
        successMsg = `Import complete! Saved ${result.dayCount} workout days with ${result.exerciseCount} total exercises.`;
      } else if (docType === "meal") {
        await saveMealPlan();
      } else if (docType === "supplement") {
        await saveSupplements();
      }

      await supabase
        .from("ai_import_jobs")
        .update({ status: "done" } as any)
        .eq("id", jobId);

      setStep("done");
      toast.success(successMsg);
    } catch (err: any) {
      setError(err.message);
      await supabase
        .from("ai_import_jobs")
        .update({ status: "failed", error_message: err.message } as any)
        .eq("id", jobId);
      toast.error("Save failed: " + err.message);
      setStep("review");
    }
  };

  const saveWorkoutProgram = async (): Promise<{ dayCount: number; exerciseCount: number }> => {
    if (!user || !extracted) return { dayCount: 0, exerciseCount: 0 };
    setSaveProgress(20);

    // Support both "days" and "workout_days" from AI extraction
    const days = extracted.days || extracted.workout_days || [];

    const isLibraryImport = !clientId;
    let programId: string;
    let phaseId: string;
    let startingSortOrder = 0;

    if (targetMode === "append-to-phase" && targetPhaseId && targetProgramId) {
      programId = targetProgramId;
      phaseId = targetPhaseId;
      const { data: existing } = await supabase
        .from("program_workouts")
        .select("sort_order")
        .eq("phase_id", phaseId)
        .order("sort_order", { ascending: false })
        .limit(1);
      startingSortOrder = (existing?.[0] as any)?.sort_order ?? 0;
    } else if (targetMode === "append-phase" && targetProgramId) {
      programId = targetProgramId;
      const { data: existingPhases } = await supabase
        .from("program_phases")
        .select("phase_order")
        .eq("program_id", programId)
        .order("phase_order", { ascending: false })
        .limit(1);
      const nextPhaseOrder = ((existingPhases?.[0] as any)?.phase_order ?? 0) + 1;
      const { data: phase, error: phaseErr } = await supabase
        .from("program_phases")
        .insert({
          program_id: programId,
          name: `Phase ${nextPhaseOrder}`,
          phase_order: nextPhaseOrder,
        } as any)
        .select()
        .single();
      if (phaseErr || !phase) throw new Error(phaseErr?.message || "Failed to create phase");
      phaseId = (phase as any).id;
    } else {
      // Legacy: create new program + first phase
      const { data: program, error: progErr } = await supabase
        .from("programs")
        .insert({
          coach_id: user.id,
          client_id: clientId || null,
          name: extracted.program_name || "Imported Program",
          description: extracted.program_description || null,
          is_template: isLibraryImport,
          is_master: isLibraryImport,
        } as any)
        .select()
        .single();
      if (progErr || !program) throw new Error(progErr?.message || "Failed to create program");
      programId = (program as any).id;

      const { data: phase, error: phaseErr } = await supabase
        .from("program_phases")
        .insert({
          program_id: programId,
          name: extracted.program_phase || "Phase 1",
          phase_order: 1,
        } as any)
        .select()
        .single();
      if (phaseErr || !phase) throw new Error(phaseErr?.message || "Failed to create phase");
      phaseId = (phase as any).id;
    }

    setSaveProgress(40);

    // New shape: extracted.workouts (unique templates) + extracted.schedule (ordered occurrences).
    // Falls back to flat days[] when the AI returned the legacy shape.
    const uniqueWorkouts: any[] = Array.isArray((extracted as any).workouts) && (extracted as any).workouts.length > 0
      ? (extracted as any).workouts
      : days.map((d: any) => ({
          day_name: d.day_name,
          instructions: d.instructions ?? null,
          exercises: d.exercises || [],
          superset_groups: d.superset_groups || [],
        }));
    const schedule: { position: number; day_name: string }[] =
      Array.isArray((extracted as any).schedule) && (extracted as any).schedule.length > 0
        ? (extracted as any).schedule
        : (Array.isArray((extracted as any).workouts) && (extracted as any).workouts.length > 0
            ? (extracted as any).workouts.map((w: any, i: number) => ({ position: i + 1, day_name: w.day_name }))
            : days.map((d: any, i: number) => ({ position: i + 1, day_name: d.day_name || `Day ${i + 1}` })));

    if (uniqueWorkouts.length === 0) {
      throw new Error("No workouts found in the extracted data. The AI could not identify any workout days.");
    }

    // Build the exercise plan for one template using the resolved exercise IDs.
    const buildExercisePlan = async (tpl: any): Promise<{ plan: WorkoutExercisePlanInput[]; failed: string[] }> => {
      const dayExercises: any[] = tpl.exercises || [];
      const failed: string[] = [];

      // Precompute group rest map (applied to last exercise of each superset only)
      const groupRestById = new Map<string, number>();
      const supersetGroups: any[] = tpl.superset_groups || [];
      for (const g of supersetGroups) {
        if (g?.grouping_id) groupRestById.set(String(g.grouping_id), Number(g.rest_seconds_between_rounds ?? 0));
      }
      const lastIndexByGroup = new Map<string, number>();
      dayExercises.forEach((ex: any, idx: number) => {
        if (ex?.grouping_id) lastIndexByGroup.set(String(ex.grouping_id), idx);
      });

      const plan: WorkoutExercisePlanInput[] = [];
      for (let ei = 0; ei < dayExercises.length; ei++) {
        const ex = dayExercises[ei];
        const match = matchResults?.exercises?.[ex.name];
        let exerciseId = match?.matched_id as string | undefined;

        if (!exerciseId) {
          const { data: newEx, error: newExErr } = await supabase
            .from("exercises")
            .insert({ name: ex.name, coach_id: user.id } as any)
            .select()
            .single();
          if (newExErr || !newEx) {
            console.error("[ai-import] failed to create exercise:", ex.name, newExErr);
            failed.push(ex.name);
            continue;
          }
          exerciseId = (newEx as any).id;
        }
        if (!exerciseId) {
          failed.push(ex.name);
          continue;
        }

        const groupId = ex?.grouping_id ? String(ex.grouping_id) : null;
        let finalRest: number;
        if (groupId && groupRestById.has(groupId)) {
          const isLast = lastIndexByGroup.get(groupId) === ei;
          finalRest = isLast ? (groupRestById.get(groupId) ?? 0) : 0;
        } else {
          finalRest = typeof ex.rest_seconds === "number" ? ex.rest_seconds : 0;
        }

        plan.push({
          exercise_id: exerciseId,
          exercise_order: ei + 1,
          sets: ex.sets || 3,
          reps: ex.reps || "10",
          tempo: ex.tempo || null,
          rest_seconds: finalRest,
          rir: ex.rir != null ? parseInt(String(ex.rir), 10) : null,
          rpe_target: ex.rpe != null ? parseFloat(String(ex.rpe)) : null,
          notes: ex.notes || null,
          superset_group: null,
          grouping_type: ex.grouping_type || null,
          grouping_id: ex.grouping_id || null,
        });
      }

      return { plan, failed };
    };

    // 1. Always create a FRESH workout row per template (never mutate master shells).
    //    Reusing a matched master workout would delete/rewrite its exercises and
    //    silently fail under RLS for non-owner coaches. Cloning is safe for
    //    admins, coaches, and managers alike.
    const workoutIdByName = new Map<string, string>();
    const perDayResults: { dayName: string; exercisesExpected: number; exercisesCopied: number; errors: string[] }[] = [];
    let totalExercisesSaved = 0;

    for (let wi = 0; wi < uniqueWorkouts.length; wi++) {
      const tpl = uniqueWorkouts[wi];
      const name: string = tpl.day_name || `Day ${wi + 1}`;
      setSaveProgress(40 + Math.round((wi / uniqueWorkouts.length) * 40));

      const { data: workout, error: wErr } = await supabase
        .from("workouts")
        .insert({
          coach_id: user.id,
          client_id: clientId || null,
          name,
          description: tpl.instructions || null,
          is_template: isLibraryImport,
        } as any)
        .select()
        .single();

      if (wErr || !workout) {
        const msg = wErr?.message || "unknown error";
        console.error("[ai-import] Failed to create workout row:", name, wErr);
        perDayResults.push({ dayName: name, exercisesExpected: (tpl.exercises || []).length, exercisesCopied: 0, errors: [`Create workout failed: ${msg}`] });
        continue;
      }

      const workoutId = (workout as any).id as string;
      workoutIdByName.set(name, workoutId);

      const { plan, failed } = await buildExercisePlan(tpl);
      const errors: string[] = failed.length > 0 ? [`Skipped exercises: ${failed.join(", ")}`] : [];

      if (plan.length > 0) {
        try {
          await replaceWorkoutExercisePlan({
            workoutId,
            name,
            instructions: tpl.instructions || null,
            isAccessory: null,
            exercises: plan,
          });
          totalExercisesSaved += plan.length;
        } catch (planErr: any) {
          const msg = planErr?.message || "unknown error";
          console.error("[ai-import] replace_workout_exercise_plan failed:", name, planErr);
          errors.push(`Save exercises failed: ${msg}`);
        }
      }

      perDayResults.push({
        dayName: name,
        exercisesExpected: (tpl.exercises || []).length,
        exercisesCopied: plan.length,
        errors,
      });
    }

    if (workoutIdByName.size === 0) {
      const firstErr = perDayResults.find((r) => r.errors.length > 0)?.errors[0] || "unknown error";
      throw new Error(`Failed to create any workouts. ${firstErr}. Check that you have permission to create workouts in this program.`);
    }

    setSaveProgress(85);

    // 2. Schedule: insert one program_workouts row per scheduled occurrence
    let scheduledCount = 0;
    const scheduleErrors: string[] = [];
    for (let si = 0; si < schedule.length; si++) {
      const entry = schedule[si];
      const workoutId = workoutIdByName.get(entry.day_name);
      if (!workoutId) {
        scheduleErrors.push(`Missing workout: ${entry.day_name}`);
        continue;
      }
      const { error: pwErr } = await supabase.from("program_workouts").insert({
        phase_id: phaseId,
        workout_id: workoutId,
        sort_order: startingSortOrder + si + 1,
        day_label: entry.day_name,
      });
      if (pwErr) {
        console.error("[ai-import] program_workouts insert failed:", entry.day_name, pwErr);
        scheduleErrors.push(`${entry.day_name}: ${pwErr.message}`);
      } else {
        scheduledCount++;
      }
    }

    if (scheduledCount === 0) {
      throw new Error(`No workouts were attached to the phase. ${scheduleErrors[0] || "Check RLS permissions."}`);
    }

    // If client (legacy new-program flow only), create assignment
    if (clientId && targetMode === "new-program") {
      await supabase.from("client_program_assignments").insert({
        client_id: clientId,
        program_id: programId,
        coach_id: user.id,
        current_phase_id: phaseId,
        current_week_number: 1,
        status: "active",
      });
    }

    // Warn about partial failures
    const partialDays = perDayResults.filter((r) => r.exercisesCopied < r.exercisesExpected || r.errors.length > 0);
    if (partialDays.length > 0 || scheduleErrors.length > 0) {
      const lines = [
        ...partialDays.map((d) => `• ${d.dayName}: ${d.exercisesCopied}/${d.exercisesExpected} exercises`),
        ...scheduleErrors.map((e) => `• Schedule: ${e}`),
      ];
      toast.warning(`Import completed with warnings\n${lines.slice(0, 5).join("\n")}`);
    }

    console.log(`[ai-import] Complete: ${uniqueWorkouts.length} unique workouts, ${scheduledCount} scheduled days, ${totalExercisesSaved} exercises saved`);
    setSaveProgress(95);
    return { dayCount: scheduledCount, exerciseCount: totalExercisesSaved };
  };


  const saveMealPlan = async () => {
    if (!user || !extracted) return;
    setSaveProgress(20);

    const days = extracted.days || [];
    const debugDays = import.meta.env.VITE_DEBUG_AI_IMPORT === "true";

    // Classify each day as 'training' | 'rest' | 'all_days'.
    // Prefers explicit day_type from the model, falls back to keyword matching on the label,
    // then a sensible 2-day default.
    const classifyDayType = (label: string, idx: number, total: number, hint?: string): "training" | "rest" | "all_days" => {
      const fromModel = (hint || "").toLowerCase().trim();
      if (fromModel === "training" || fromModel === "rest" || fromModel === "all_days") return fromModel;
      const l = (label || "").toLowerCase();
      if (/\b(rest|non[\s-]?training|non[\s-]?workout|off|off[\s-]?day|recovery|low[\s-]?carb)\b/.test(l)) return "rest";
      if (/\b(workout|training|lift|lifting|gym|high[\s-]?carb|on[\s-]?day)\b/.test(l)) return "training";
      if (total === 2) return idx === 0 ? "training" : "rest";
      return "all_days";
    };

    const labelFor = (dayType: "training" | "rest" | "all_days") =>
      dayType === "training" ? "Training Day" : dayType === "rest" ? "Rest Day" : "All Days";

    // First pass: classify, then enforce that 2-day templates have one of each type.
    const classifications: ("training" | "rest" | "all_days")[] = days.map((d: any, i: number) =>
      classifyDayType(d.day_label || `Day ${i + 1}`, i, days.length, d.day_type)
    );
    if (days.length === 2 && classifications[0] === classifications[1]) {
      classifications[1] = classifications[0] === "training" ? "rest" : "training";
    }
    if (debugDays) {
      console.log("[ai-import][meal-days]", JSON.stringify(
        days.map((d: any, i: number) => ({ label: d.day_label, hint: d.day_type, final: classifications[i] }))
      ));
    }

    // Set parent meal_plans.day_type. The column is NOT NULL DEFAULT 'training',
    // so for mixed (training + rest) two-day templates we keep 'training' as a
    // safe parent default — the actual per-day classification still lives on
    // meal_plan_days.day_type, which is what the client tabs read.
    const uniqueTypes = Array.from(new Set(classifications));
    const planDayType: "training" | "rest" | "all_days" =
      uniqueTypes.length === 1 ? uniqueTypes[0] : "training";
    const planDayLabel = labelFor(planDayType);

    const isLibraryImport = !clientId;
    const { data: plan, error: planErr } = await supabase
      .from("meal_plans")
      .insert({
        coach_id: user.id,
        client_id: clientId || null,
        name: extracted.plan_name || "Imported Meal Plan",
        is_template: isLibraryImport,
        flexibility_mode: false,
        day_type: planDayType,
        day_type_label: planDayLabel,
      } as any)
      .select()
      .single();
    if (planErr || !plan) throw new Error(planErr?.message || "Failed to create meal plan");

    let savedDayCount = 0;
    let savedItemCount = 0;
    const dayErrors: string[] = [];

    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      setSaveProgress(20 + Math.round((di / days.length) * 70));

      const dayType = classifications[di];

      const { data: mpDay, error: mpDayErr } = await supabase
        .from("meal_plan_days")
        .insert({
          meal_plan_id: (plan as any).id,
          day_type: dayType,
          day_order: di + 1,
        })
        .select()
        .single();
      if (mpDayErr || !mpDay) {
        dayErrors.push(`${day.day_label || `Day ${di + 1}`}: ${mpDayErr?.message || "day insert failed"}`);
        continue;
      }
      savedDayCount++;

      let mealOrder = 0;
      for (const meal of day.meals || []) {
        mealOrder++;
        const mealName = meal.meal_name || `Meal ${mealOrder}`;
        const mealType = `meal_${mealOrder}`;
        let itemOrder = 0;

        for (const food of meal.foods || []) {
          itemOrder++;

          // Source of truth = PDF macros, verbatim
          const pdfCal = Number(food.calories) || 0;
          const pdfP = Number(food.protein) || 0;
          const pdfC = Number(food.carbs) || 0;
          const pdfF = Number(food.fat) || 0;

          // Quantity: prefer structured fields; fall back to legacy "quantity" string
          let qtyValue: number = Number(food.quantity_value);
          let qtyUnit: string = String(food.quantity_unit || "").toLowerCase().trim();
          if (!qtyValue || isNaN(qtyValue)) {
            const raw = String(food.quantity || "");
            const m = raw.match(/([\d.]+)\s*([a-zA-Z]+)?/);
            if (m) {
              qtyValue = parseFloat(m[1]);
              if (!qtyUnit) qtyUnit = (m[2] || "g").toLowerCase();
            }
          }
          if (!qtyUnit) qtyUnit = "g";
          if (!qtyValue || isNaN(qtyValue) || qtyValue <= 0) {
            // skip rows we can't quantify
            continue;
          }

          const match = matchResults?.foods?.[food.name];
          const matchScore = Number(match?.confidence_score || 0);
          const isMassUnit = qtyUnit === "g" || qtyUnit === "ml";
          let foodItemId: string | null = match?.matched_id || null;

          // Auto-create a sized food_items row when:
          //  - the unit isn't grams/ml (slice, unit, scoop, tbsp, …), OR
          //  - the matched candidate is weak (< 75 confidence)
          if (!isMassUnit || matchScore < 75) {
            const { data: createdFood, error: createdFoodErr } = await supabase
              .from("food_items")
              .insert({
                name: food.name,
                created_by: user.id,
                is_verified: false,
                serving_size: qtyValue,
                serving_unit: qtyUnit,
                calories: pdfCal,
                protein: pdfP,
                carbs: pdfC,
                fat: pdfF,
              } as any)
              .select("id")
              .single();
            if (createdFoodErr) {
              console.warn("[ai-import][meal] food_items insert failed", createdFoodErr.message, food.name);
            }
            foodItemId = (createdFood as any)?.id || foodItemId;
          }

          const { error: itemErr } = await supabase.from("meal_plan_items").insert({
            meal_plan_id: (plan as any).id,
            day_id: (mpDay as any).id,
            food_item_id: foodItemId,
            custom_name: food.name,
            meal_name: mealName,
            meal_type: mealType,
            gram_amount: qtyValue,
            servings: qtyValue,
            serving_size: qtyValue,
            serving_unit: qtyUnit,
            calories: pdfCal,
            protein: pdfP,
            carbs: pdfC,
            fat: pdfF,
            meal_order: mealOrder,
            item_order: itemOrder,
          } as any);
          if (itemErr) {
            dayErrors.push(`${day.day_label || `Day ${di + 1}`} / ${mealName} / ${food.name}: ${itemErr.message}`);
          } else {
            savedItemCount++;
          }
        }

      }
    }
    setSaveProgress(95);

    if (savedItemCount === 0) {
      throw new Error(dayErrors[0] || "No meal items were saved. Check permissions and try again.");
    }
    if (dayErrors.length > 0) {
      console.warn("[ai-import][meal] partial errors:", dayErrors);
      toast.warning(`Saved ${savedItemCount} items, but ${dayErrors.length} row(s) failed. See console.`);
    }
    toast.success(`Import complete! Saved ${savedDayCount} day${savedDayCount === 1 ? "" : "s"} with ${savedItemCount} food items.`);
  };


  const saveSupplements = async () => {
    if (!user || !extracted) return;
    setSaveProgress(20);

    const supplements = extracted.supplements || [];
    const planName = extracted.plan_name || "Imported Supplement Stack";
    const isLibraryImport = !clientId;

    // Step 1: Create the supplement plan
    const { data: plan, error: planErr } = await supabase
      .from("supplement_plans")
      .insert({
        coach_id: user.id,
        name: planName,
        description: `AI-imported from uploaded document. ${supplements.length} supplements.`,
        is_template: true,
        is_master: isLibraryImport,
      } as any)
      .select()
      .single();
    if (planErr || !plan) throw new Error(planErr?.message || "Failed to create supplement plan");

    setSaveProgress(30);

    let createdCount = 0;
    let matchedCount = 0;
    let skippedCount = 0;

    // Step 2: For each supplement, find or create in catalog, then add to plan
    for (let i = 0; i < supplements.length; i++) {
      const supp = supplements[i];
      setSaveProgress(30 + Math.round((i / supplements.length) * 60));

      // Safety net: never insert blank-named supplements (would show as "Unknown")
      const cleanName = (supp.name || "").trim();
      if (!cleanName) {
        console.warn("Skipping supplement with empty name", supp);
        skippedCount++;
        continue;
      }
      const finalName = cleanName.length > 0 ? cleanName : "Unmapped Supplement";

      let suppId: string | null = null;

      // Check if we have a match from the edge function
      const match = matchResults?.supplements?.[supp.name];
      if (match?.matched_id && match.confidence >= 0.5) {
        suppId = match.matched_id;
        matchedCount++;
      }

      // If no match, create new master supplement
      if (!suppId) {
        const { data: newSupp, error: newSuppErr } = await supabase
          .from("master_supplements")
          .insert({
            name: finalName,
            brand: supp.brand || null,
            coach_id: user.id,
            default_dosage: supp.dosage || null,
            default_dosage_unit: supp.dosage_unit || null,
            notes: supp.reason || null,
            is_active: true,
            is_master: isLibraryImport,
          })
          .select()
          .single();
        if (newSuppErr || !newSupp) {
          console.error("Failed to create supplement:", finalName, newSuppErr);
          continue;
        }
        suppId = (newSupp as any).id;
        createdCount++;
      }

      // Add item to the plan
      if (suppId) {
        const { error: itemErr } = await supabase.from("supplement_plan_items").insert({
          plan_id: (plan as any).id,
          master_supplement_id: suppId,
          dosage: supp.dosage || null,
          dosage_unit: supp.dosage_unit || null,
          timing_slot: supp.timing_slot || "any_time",
          sort_order: i + 1,
          coach_note: supp.coach_note || null,
        });
        if (itemErr) console.error("Failed to add plan item:", finalName, itemErr);
      }
    }

    setSaveProgress(95);
    const importedCount = supplements.length - skippedCount;
    toast.success(`Import complete! Created "${planName}" with ${importedCount} supplements (${matchedCount} matched, ${createdCount} new catalog entries).`);
    if (skippedCount > 0) {
      toast.warning(`${skippedCount} supplement${skippedCount === 1 ? "" : "s"} skipped — couldn't read name from PDF.`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && step === "saving") return; onOpenChange(next); }}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        onEscapeKeyDown={(e) => { if (step === "saving") e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (step === "saving") e.preventDefault(); }}
        onInteractOutside={(e) => { if (step === "saving") e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            AI Import
          </DialogTitle>
          <DialogDescription>
            Upload a PDF and let AI extract structured data.
          </DialogDescription>
        </DialogHeader>

        {/* UPLOAD STEP */}
        {step === "upload" && (
          <div className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {isTargetedWorkoutImport && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs text-foreground">
                  {targetMode === "append-to-phase"
                    ? "Workouts from this PDF will be added to the selected phase."
                    : "A new auto-numbered phase will be added to this program with the imported workouts."}
                </p>
              </div>
            )}

            {effectiveImportType === "any" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Document Type</label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workout">Workout Program</SelectItem>
                    <SelectItem value="meal">Meal Plan</SelectItem>
                    <SelectItem value="supplement">Supplement Stack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById("ai-import-file-input")?.click()}
            >
              <Upload className="h-8 w-8 text-primary/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Drag & drop PDF or images, or click to browse
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                PDF, PNG, JPG supported
              </p>
              <input
                id="ai-import-file-input"
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-card border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-foreground truncate">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({(f.size / 1024).toFixed(0)}KB)
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full"
              disabled={files.length === 0}
              onClick={startProcessing}
            >
              Process with AI
            </Button>
          </div>
        )}

        {/* PROCESSING STEP */}
        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Analyzing document...</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI is extracting structured data. This may take 10-30 seconds.
              </p>
            </div>
            <div className="w-48">
              <Progress value={undefined} className="h-1.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* REVIEW STEP */}
        {step === "review" && extracted && (
          <div className="space-y-4">
            {docType === "workout" && matchResults && (
              <ExerciseMatchReview
                extracted={extracted}
                matchResults={matchResults}
                onUpdateMatches={(updated) =>
                  setMatchResults({ ...matchResults, exercises: updated })
                }
              />
            )}
            {docType === "meal" && matchResults && (
              <FoodMatchReview
                extracted={extracted}
                matchResults={matchResults}
                onUpdateMatches={(updated) =>
                  setMatchResults({ ...matchResults, foods: updated })
                }
              />
            )}
            {docType === "supplement" && (
              <SupplementReview
                extracted={extracted}
                matchResults={matchResults}
                onUpdateExtracted={(updated) => setExtracted(updated)}
              />
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("upload"); setError(null); }}>
                Back
              </Button>
              <Button className="flex-1" onClick={confirmAndSave}>
                Confirm & Save
              </Button>
            </div>
          </div>
        )}

        {/* SAVING STEP */}
        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">Saving to database...</p>
            <div className="w-64">
              <Progress value={saveProgress} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground">{saveProgress}%</p>
          </div>
        )}

        {/* DONE STEP */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Import Complete!</p>
              <p className="text-xs text-muted-foreground mt-1">
                All data has been saved successfully.
              </p>
            </div>
            <Button onClick={() => { onImportComplete?.(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AIImportModal;
