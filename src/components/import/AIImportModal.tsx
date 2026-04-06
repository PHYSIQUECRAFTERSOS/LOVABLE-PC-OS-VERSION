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

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    textParts.push(`--- Page ${i} ---\n${pageText}`);
  }
  return textParts.join("\n");
}

type Step = "upload" | "processing" | "review" | "saving" | "done";

interface AIImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryPoint: "library" | "client";
  clientId?: string;
  importType: "workout" | "meal" | "supplement" | "any";
  onImportComplete?: () => void;
}

const AIImportModal = ({ open, onOpenChange, entryPoint, clientId, importType, onImportComplete }: AIImportModalProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState<string>(importType === "any" ? "workout" : importType);
  const [jobId, setJobId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any>(null);
  const [matchResults, setMatchResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setFiles([]);
      setDocType(importType === "any" ? "workout" : importType);
      setJobId(null);
      setExtracted(null);
      setMatchResults(null);
      setError(null);
      setSaveProgress(0);
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [open, importType]);

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

    // Check file size limit (50MB total)
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      setError("File too large. Please use a PDF under 50MB.");
      toast.error("File too large. Please use a PDF under 50MB.");
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
          const extractedText = await extractTextFromPDF(file);
          console.log("Extracted text length:", extractedText.length, "characters");
          uploadBlob = new Blob([extractedText], { type: "text/plain" });
          uploadName = file.name.replace(/\.pdf$/i, ".txt");
        }

        const storagePath = `${user.id}/${newJobId}/${uploadName}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("ai-import-uploads")
          .upload(storagePath, uploadBlob, { upsert: true });

        if (uploadErr) {
          console.error("Storage upload error:", uploadErr);
          await supabase
            .from("ai_import_jobs")
            .update({ status: "failed", error_message: "File upload failed" } as any)
            .eq("id", newJobId);
          throw new Error("File upload failed - check your connection and try again.");
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

      if (fnErr) throw new Error(fnErr.message || "Processing failed");

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

      if (docType === "workout") {
        await saveWorkoutProgram();
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
      toast.success("Import complete!");
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

  const saveWorkoutProgram = async () => {
    if (!user || !extracted) return;
    setSaveProgress(20);

    // Support both "days" and "workout_days" from AI extraction
    const days = extracted.days || extracted.workout_days || [];

    // Create program - set is_master: true for library imports so it appears in Shared
    const isLibraryImport = !clientId;
    const { data: prog, error: progErr } = await supabase
      .from("programs")
      .insert({
        coach_id: user.id,
        name: extracted.program_name || "Imported Program",
        is_template: isLibraryImport,
        is_master: isLibraryImport,
        client_id: clientId || null,
      } as any)
      .select()
      .single();
    if (progErr || !prog) throw new Error(progErr?.message || "Failed to create program");
    console.log("Created program:", (prog as any).id, "Full record:", prog);

    // Create a single phase
    const { data: phase, error: phaseErr } = await supabase
      .from("program_phases")
      .insert({
        program_id: (prog as any).id,
        name: extracted.program_phase || "Phase 1",
        phase_order: 1,
        duration_weeks: 4,
      })
      .select()
      .single();
    if (phaseErr || !phase) throw new Error(phaseErr?.message || "Failed to create phase");
    console.log("Created phase:", (phase as any).id);

    setSaveProgress(40);

    let totalExercisesSaved = 0;

    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      setSaveProgress(40 + Math.round((di / days.length) * 50));

      // Create workout
      const { data: workout, error: wErr } = await supabase
        .from("workouts")
        .insert({
          coach_id: user.id,
          client_id: clientId || null,
          name: day.day_name || `Day ${di + 1}`,
          is_template: isLibraryImport,
        } as any)
        .select()
        .single();
      if (wErr || !workout) {
        console.error("Failed to create workout for day:", day.day_name, wErr);
        continue;
      }
      console.log("Created workout:", (workout as any).id, "for day:", day.day_name);

      // Link to phase
      await supabase.from("program_workouts").insert({
        phase_id: (phase as any).id,
        workout_id: (workout as any).id,
        sort_order: di + 1,
        day_label: day.day_name || `Day ${di + 1}`,
      });

      // Add exercises
      const dayExercises = day.exercises || [];
      console.log("Inserting exercises for workout:", (workout as any).id, "count:", dayExercises.length);

      for (let ei = 0; ei < dayExercises.length; ei++) {
        const ex = dayExercises[ei];
        const match = matchResults?.exercises?.[ex.name];
        let exerciseId = match?.matched_id;

        // If no match, create new exercise
        if (!exerciseId) {
          const { data: newEx, error: newExErr } = await supabase
            .from("exercises")
            .insert({ name: ex.name, coach_id: user.id } as any)
            .select()
            .single();
          if (newExErr) {
            console.error("Failed to create exercise:", ex.name, newExErr);
            continue;
          }
          exerciseId = (newEx as any)?.id;
        }

        if (exerciseId) {
          const { data: insertData, error: insertError } = await supabase.from("workout_exercises").insert({
            workout_id: (workout as any).id,
            exercise_id: exerciseId,
            exercise_order: ei + 1,
            sets: ex.sets || 3,
            reps: ex.reps || "10",
            rest_seconds: ex.rest_seconds || null,
            tempo: ex.tempo || null,
            rir: ex.rir ? parseInt(ex.rir, 10) : null,
            rpe_target: ex.rpe ? parseFloat(ex.rpe) : null,
            notes: ex.notes || null,
            grouping_type: ex.grouping_type || null,
            grouping_id: ex.grouping_id || null,
          }).select();
          console.log("Exercise insert result:", insertData, insertError);
          if (!insertError) totalExercisesSaved++;
        }
      }
    }

    // If client, create assignment
    if (clientId) {
      await supabase.from("client_program_assignments").insert({
        client_id: clientId,
        program_id: (prog as any).id,
        coach_id: user.id,
        current_phase_id: (phase as any).id,
        current_week_number: 1,
        status: "active",
      });
    }
    console.log(`Import complete: ${days.length} workout days, ${totalExercisesSaved} exercises saved`);
    setSaveProgress(95);
  };

  const saveMealPlan = async () => {
    if (!user || !extracted) return;
    setSaveProgress(20);

    const { data: plan, error: planErr } = await supabase
      .from("meal_plans")
      .insert({
        coach_id: user.id,
        client_id: clientId || null,
        name: extracted.plan_name || "Imported Meal Plan",
        is_template: !clientId,
      } as any)
      .select()
      .single();
    if (planErr || !plan) throw new Error(planErr?.message || "Failed to create meal plan");

    const days = extracted.days || [];
    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      setSaveProgress(20 + Math.round((di / days.length) * 70));

      const { data: mpDay } = await supabase
        .from("meal_plan_days")
        .insert({
          meal_plan_id: (plan as any).id,
          day_number: di + 1,
          day_label: day.day_label || `Day ${di + 1}`,
        })
        .select()
        .single();
      if (!mpDay) continue;

      for (const meal of day.meals || []) {
        for (const food of meal.foods || []) {
          const match = matchResults?.foods?.[food.name];
          await supabase.from("meal_plan_items").insert({
            meal_plan_day_id: (mpDay as any).id,
            meal_slot: meal.meal_name || "Meal",
            food_name: food.name,
            food_id: match?.matched_id || null,
            quantity: food.quantity || "1 serving",
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
          } as any);
        }
      }
    }
    setSaveProgress(95);
  };

  const saveSupplements = async () => {
    if (!user || !extracted) return;
    setSaveProgress(30);

    const supplements = extracted.supplements || [];

    // Create or find supplement plan
    let planId: string | null = null;
    if (clientId) {
      const { data: existing } = await (supabase as any)
        .from("supplement_plans")
        .select("id")
        .eq("client_id", clientId)
        .eq("coach_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        planId = (existing as any).id;
      } else {
        const { data: newPlan } = await (supabase as any)
          .from("supplement_plans")
          .insert({ client_id: clientId, coach_id: user.id, status: "active" })
          .select()
          .single();
        planId = (newPlan as any)?.id;
      }
    }

    for (let i = 0; i < supplements.length; i++) {
      const supp = supplements[i];
      setSaveProgress(30 + Math.round((i / supplements.length) * 60));

      // Check if master supplement exists
      const { data: existing } = await supabase
        .from("master_supplements")
        .select("id")
        .ilike("name", supp.name)
        .maybeSingle();

      let suppId = (existing as any)?.id;
      if (!suppId) {
        const { data: newSupp } = await supabase
          .from("master_supplements")
          .insert({
            name: supp.name,
            coach_id: user.id,
            default_dose: supp.dose,
            default_timing: supp.timing,
            notes: supp.reason,
          } as any)
          .select()
          .single();
        suppId = (newSupp as any)?.id;
      }

      if (planId && suppId) {
        await supabase.from("supplement_plan_items").insert({
          plan_id: planId,
          supplement_id: suppId,
          dose: supp.dose,
          timing: supp.timing,
          notes: supp.notes,
        } as any);
      }
    }
    setSaveProgress(95);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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

            {importType === "any" && (
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
            {docType === "supplement" && <SupplementReview extracted={extracted} />}

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
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
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
