import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import OnboardingGoals from "@/components/onboarding/OnboardingGoals";
import OnboardingMetrics from "@/components/onboarding/OnboardingMetrics";
import OnboardingBodyComp from "@/components/onboarding/OnboardingBodyComp";
import OnboardingTrainingEnv from "@/components/onboarding/OnboardingTrainingEnv";
import OnboardingSchedule from "@/components/onboarding/OnboardingSchedule";
import OnboardingNutritionPrefs from "@/components/onboarding/OnboardingNutritionPrefs";
import OnboardingNutrition from "@/components/onboarding/OnboardingNutrition";
import OnboardingTraining from "@/components/onboarding/OnboardingTraining";
import OnboardingTrainingHistory from "@/components/onboarding/OnboardingTrainingHistory";
import OnboardingMotivation from "@/components/onboarding/OnboardingMotivation";
import OnboardingFinalNotes from "@/components/onboarding/OnboardingFinalNotes";
import OnboardingHealthSync from "@/components/onboarding/OnboardingHealthSync";
import OnboardingWaiver from "@/components/onboarding/OnboardingWaiver";
import OnboardingDisclaimer from "@/components/onboarding/OnboardingDisclaimer";
import OnboardingSummary from "@/components/onboarding/OnboardingSummary";
import OnboardingProfilePhoto from "@/components/onboarding/OnboardingProfilePhoto";
import OnboardingHealthSyncFull from "@/components/onboarding/OnboardingHealthSyncFull";

export interface OnboardingData {
  // Goals & Metrics (existing)
  primary_goal: string;
  gender: string;
  age: number | null;
  height_feet: number | null;
  height_inches: number | null;
  height_cm: number | null;
  weight_lb: number | null;
  current_weight_kg: number | null;
  estimated_body_fat_pct: number | null;
  activity_level: string;
  // Nutrition history (existing)
  tracked_macros_before: boolean | null;
  food_intolerances: string[];
  digestive_issues: string[];
  custom_allergy_text: string;
  custom_digestive_text: string;
  // Training background (existing)
  injuries: string;
  surgeries: string;
  // Health sync (existing)
  health_sync_status: string;
  // Body comp (existing)
  bodyfat_range_low: number | null;
  bodyfat_range_high: number | null;
  bodyfat_final_confirmed: number | null;
  confidence_level: string;
  baseline_assessment_date: string | null;
  baseline_photo_set_id: string;
  upper_body_score: number | null;
  midsection_score: number | null;
  lower_body_score: number | null;
  posture_flag: string;
  // NEW — Training environment
  training_location: string;
  home_equipment_list: string;
  equipment_photo_urls: string[];
  gym_name_address: string;
  // NEW — Schedule & Lifestyle
  wake_time: string;
  workout_time: string;
  sleep_time: string;
  occupation: string;
  // NEW — Nutrition preferences
  foods_love: string;
  foods_dislike: string;
  // NEW — Training history
  workout_days_current: string;
  workout_days_realistic: string;
  workout_days_realistic_other: string;
  available_days: string[];
  // NEW — Motivation
  motivation_text: string;
  favorite_body_part: string;
  work_on_most: string;
  // NEW — Final notes
  final_notes: string;
  // NEW — Waiver
  waiver_signed: boolean;
  waiver_signed_at: string;
  waiver_signature: string;
}

const TOTAL_STEPS = 14;

const defaultData: OnboardingData = {
  primary_goal: "",
  gender: "",
  age: null,
  height_feet: null,
  height_inches: null,
  height_cm: null,
  weight_lb: null,
  current_weight_kg: null,
  estimated_body_fat_pct: null,
  activity_level: "",
  tracked_macros_before: null,
  food_intolerances: [],
  digestive_issues: [],
  custom_allergy_text: "",
  custom_digestive_text: "",
  injuries: "",
  surgeries: "",
  health_sync_status: "pending",
  bodyfat_range_low: null,
  bodyfat_range_high: null,
  bodyfat_final_confirmed: null,
  confidence_level: "",
  baseline_assessment_date: null,
  baseline_photo_set_id: "",
  upper_body_score: null,
  midsection_score: null,
  lower_body_score: null,
  posture_flag: "",
  training_location: "",
  home_equipment_list: "",
  equipment_photo_urls: [],
  gym_name_address: "",
  wake_time: "",
  workout_time: "",
  sleep_time: "",
  occupation: "",
  foods_love: "",
  foods_dislike: "",
  workout_days_current: "",
  workout_days_realistic: "",
  workout_days_realistic_other: "",
  available_days: [],
  motivation_text: "",
  favorite_body_part: "",
  work_on_most: "",
  final_notes: "",
  waiver_signed: false,
  waiver_signed_at: "",
  waiver_signature: "",
};

const stepLabels: Record<number, string> = {
  1: "Goals",
  2: "Metrics",
  3: "Body Comp",
  4: "Training Environment",
  5: "Schedule",
  6: "Food Preferences",
  7: "Nutrition History",
  8: "Injuries",
  9: "Training History",
  10: "Motivation",
  11: "Final Notes",
  12: "Health Sync",
  13: "Digital Waiver",
  14: "Summary",
};

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [postStep, setPostStep] = useState<"none" | "photo" | "health" | "success">("none");
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("onboarding_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data: existing }) => {
        if (existing) {
          if (existing.onboarding_completed) {
            navigate("/dashboard", { replace: true });
            return;
          }
          setStep(existing.current_step || 1);
          setData(prev => {
            const merged = { ...prev };
            for (const key of Object.keys(prev) as (keyof OnboardingData)[]) {
              const val = (existing as any)[key];
              if (val !== undefined && val !== null) {
                (merged as any)[key] = val;
              }
            }
            return merged;
          });
        }
        setInitialLoading(false);
      });

    // Fetch first name for success screen
    supabase
      .from("profiles")
      .select("first_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data: profile }) => {
        if (profile?.first_name) setFirstName(profile.first_name);
      });
  }, [user]);

  const updateField = useCallback(<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
    setValidationErrors(prev => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
  }, []);

  const saveProgress = useCallback(async (nextStep: number, completed = false): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        ...data,
        current_step: nextStep,
        onboarding_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
      };
      delete payload.waiver_signature;

      const { data: existing } = await supabase
        .from("onboarding_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      let error;
      if (existing) {
        ({ error } = await supabase.from("onboarding_profiles").update(payload).eq("user_id", user.id));
      } else {
        ({ error } = await supabase.from("onboarding_profiles").insert(payload));
      }

      if (error) {
        console.error("[Onboarding] saveProgress failed:", error);
        toast.error("Failed to save your progress. Please try again.");
        return false;
      }

      // Verify the write landed when completing
      if (completed) {
        const { data: verify } = await supabase
          .from("onboarding_profiles")
          .select("onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!verify?.onboarding_completed) {
          console.error("[Onboarding] Completion flag not persisted after write");
          toast.error("Something went wrong saving your profile. Please try again.");
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error("[Onboarding] saveProgress exception:", err);
      toast.error("Connection error. Please check your internet and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, data]);

  const validateStep = (): boolean => {
    const errors: Record<string, string> = {};
    
    switch (step) {
      case 1:
        if (!data.primary_goal) errors.primary_goal = "This field is required before continuing.";
        break;
      case 2:
        if (!data.gender) errors.gender = "This field is required before continuing.";
        if (!data.age) errors.age = "This field is required before continuing.";
        if (data.height_feet == null) errors.height_feet = "This field is required before continuing.";
        if (data.height_inches == null) errors.height_inches = "This field is required before continuing.";
        if (data.weight_lb == null) errors.weight_lb = "This field is required before continuing.";
        if (!data.activity_level) errors.activity_level = "This field is required before continuing.";
        break;
      case 3:
        break;
      case 4:
        if (!data.training_location) errors.training_location = "This field is required before continuing.";
        if (data.training_location === "home") {
          if (!data.home_equipment_list?.trim())
            errors.home_equipment_list = "Please list your equipment.";
          if (!data.equipment_photo_urls || data.equipment_photo_urls.length < 1)
            errors.equipment_photo_urls = "Please upload at least 1 photo of your equipment.";
        }
        if (data.training_location === "gym") {
          if (!data.gym_name_address?.trim())
            errors.gym_name_address = "Please include your gym name and address.";
        }
        break;
      case 5:
        if (!data.wake_time) errors.wake_time = "This field is required before continuing.";
        if (!data.workout_time) errors.workout_time = "This field is required before continuing.";
        if (!data.sleep_time) errors.sleep_time = "This field is required before continuing.";
        if (!data.occupation?.trim())
          errors.occupation = "Please describe your work.";
        break;
      case 6:
        if (!data.foods_love) errors.foods_love = "This field is required before continuing.";
        if (!data.foods_dislike) errors.foods_dislike = "This field is required before continuing.";
        break;
      case 7:
        if (data.tracked_macros_before === null) errors.tracked_macros_before = "This field is required before continuing.";
        break;
      case 8:
        break;
      case 9:
        if (!data.workout_days_current) errors.workout_days_current = "This field is required before continuing.";
        if (!data.workout_days_realistic) errors.workout_days_realistic = "This field is required before continuing.";
        if (data.workout_days_realistic === "Other" && !data.workout_days_realistic_other)
          errors.workout_days_realistic_other = "Please specify.";
        if (!data.available_days || data.available_days.length < 1)
          errors.available_days = "Please select at least one day.";
        break;
      case 10:
        if (!data.motivation_text?.trim())
          errors.motivation_text = "Please share what motivates you.";
        if (!data.favorite_body_part) errors.favorite_body_part = "This field is required before continuing.";
        if (!data.work_on_most) errors.work_on_most = "This field is required before continuing.";
        break;
      case 11:
        break;
      case 12:
        break;
      case 13:
        if (!data.waiver_signed) errors.waiver_signed = "You must accept the terms to continue.";
        if (!data.waiver_signature) errors.waiver_signature = "Please sign the waiver above.";
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goNext = async () => {
    if (!validateStep()) return;
    if (step < TOTAL_STEPS) {
      if (step === 3) {
        setStep(step + 1);
        saveProgress(step + 1).catch(console.error);
      } else {
        await saveProgress(step + 1);
        setStep(step + 1);
      }
    }
  };

  const goBack = () => {
    if (step > 1) {
      setValidationErrors({});
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    if (!validateStep()) return;

    const saved = await saveProgress(TOTAL_STEPS, true);
    if (!saved) return; // Don't proceed — user can retry

    if (user) {
      // Sync onboarding weight to weight_logs (non-blocking)
      if (data.weight_lb && data.weight_lb > 0) {
        const today = new Date().toISOString().split("T")[0];
        supabase.from("weight_logs").upsert(
          {
            client_id: user.id,
            weight: data.weight_lb,
            logged_at: today,
            source: "onboarding",
          },
          { onConflict: "client_id,logged_at" }
        ).then(({ error }) => {
          if (error) console.error("[Onboarding] weight sync error:", error);
        });
      }

      // Send auto-message to coach (non-blocking)
      supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
        .then(async ({ data: assignment }) => {
          if (!assignment) return;
          const { data: thread } = await supabase
            .from("message_threads")
            .select("id")
            .eq("coach_id", assignment.coach_id)
            .eq("client_id", user.id)
            .maybeSingle();

          if (thread?.id) {
            await supabase.from("thread_messages").insert({
              thread_id: thread.id,
              sender_id: user.id,
              content: "✅ I've completed my onboarding profile! Ready to get started.",
            });
          }
        })
        .catch(console.error);
    }

    setPostStep("photo");
  };

  const handleGoToDashboard = useCallback(() => {
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  // Post-onboarding overlay screens
  if (postStep === "photo") {
    return <OnboardingProfilePhoto onComplete={() => setPostStep("health")} />;
  }
  if (postStep === "health") {
    return <OnboardingHealthSyncFull onComplete={() => setPostStep("success")} />;
  }
  if (postStep === "success") {
    return <OnboardingSuccessScreen firstName={firstName} onGoToDashboard={handleGoToDashboard} />;
  }

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="flex h-full overflow-y-auto flex-col bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg font-bold text-foreground">
              PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
            </h1>
            <span className="text-xs text-muted-foreground">
              {stepLabels[step]} — {step}/{TOTAL_STEPS}
            </span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
          <p className="text-[10px] text-muted-foreground text-right">{Math.round(progressPct)}% complete</p>
        </div>
      </div>

      <div className="flex-1 px-4 py-6">
        <div className="max-w-lg mx-auto animate-fade-in">
          {step === 1 && (
            <>
              <OnboardingDisclaimer />
              <div className="mt-6">
                <OnboardingGoals data={data} updateField={updateField} />
              </div>
            </>
          )}
          {step === 2 && <OnboardingMetrics data={data} updateField={updateField} />}
          {step === 3 && <OnboardingBodyComp data={data} updateField={updateField} />}
          {step === 4 && <OnboardingTrainingEnv data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 5 && <OnboardingSchedule data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 6 && <OnboardingNutritionPrefs data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 7 && <OnboardingNutrition data={data} updateField={updateField} />}
          {step === 8 && <OnboardingTraining data={data} updateField={updateField} />}
          {step === 9 && <OnboardingTrainingHistory data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 10 && <OnboardingMotivation data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 11 && <OnboardingFinalNotes data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 12 && <OnboardingHealthSync data={data} updateField={updateField} />}
          {step === 13 && <OnboardingWaiver data={data} updateField={updateField} validationErrors={validationErrors} />}
          {step === 14 && <OnboardingSummary data={data} />}
        </div>
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button onClick={goNext} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Continue
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              Complete Setup
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Success Screen ─── */

interface SuccessProps {
  firstName: string;
  onGoToDashboard: () => void;
}

const OnboardingSuccessScreen = ({ firstName, onGoToDashboard }: SuccessProps) => {
  useEffect(() => {
    const timer = setTimeout(onGoToDashboard, 3000);
    return () => clearTimeout(timer);
  }, [onGoToDashboard]);

  const greeting = firstName ? `Welcome, ${firstName}!` : "Welcome!";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-8 animate-fade-in">
        {/* Animated check */}
        <div className="h-28 w-28 rounded-full bg-primary/10 flex items-center justify-center animate-scale-in">
          <CheckCircle2 className="h-14 w-14 text-primary" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">{greeting}</h2>
          <p className="text-lg font-semibold text-primary">You're all set.</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your coach has been notified and will review your profile. Let's get started!
          </p>
        </div>

        <Button
          className="w-full h-12 text-base font-semibold gap-2"
          onClick={onGoToDashboard}
        >
          GO TO DASHBOARD
          <ArrowRight className="h-5 w-5" />
        </Button>

        <p className="text-xs text-muted-foreground">Auto-redirecting in a few seconds…</p>
      </div>
    </div>
  );
};

export default Onboarding;
