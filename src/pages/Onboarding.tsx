import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import OnboardingGoals from "@/components/onboarding/OnboardingGoals";
import OnboardingMetrics from "@/components/onboarding/OnboardingMetrics";
import OnboardingNutrition from "@/components/onboarding/OnboardingNutrition";
import OnboardingTraining from "@/components/onboarding/OnboardingTraining";
import OnboardingHealthSync from "@/components/onboarding/OnboardingHealthSync";
import OnboardingSummary from "@/components/onboarding/OnboardingSummary";

export interface OnboardingData {
  primary_goal: string;
  age: number | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  estimated_body_fat_pct: number | null;
  activity_level: string;
  tracked_macros_before: boolean | null;
  food_intolerances: string[];
  digestive_issues: string[];
  injuries: string;
  surgeries: string;
  health_sync_status: string;
}

const TOTAL_STEPS = 6;

const defaultData: OnboardingData = {
  primary_goal: "",
  age: null,
  height_cm: null,
  current_weight_kg: null,
  estimated_body_fat_pct: null,
  activity_level: "",
  tracked_macros_before: null,
  food_intolerances: [],
  digestive_issues: [],
  injuries: "",
  surgeries: "",
  health_sync_status: "pending",
};

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(defaultData);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load existing onboarding data
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
          setData({
            primary_goal: existing.primary_goal || "",
            age: existing.age,
            height_cm: existing.height_cm,
            current_weight_kg: existing.current_weight_kg,
            estimated_body_fat_pct: existing.estimated_body_fat_pct,
            activity_level: existing.activity_level || "",
            tracked_macros_before: existing.tracked_macros_before,
            food_intolerances: existing.food_intolerances || [],
            digestive_issues: existing.digestive_issues || [],
            injuries: existing.injuries || "",
            surgeries: existing.surgeries || "",
            health_sync_status: existing.health_sync_status || "pending",
          });
        }
        setInitialLoading(false);
      });
  }, [user]);

  const updateField = useCallback(<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  // Auto-save on step change
  const saveProgress = useCallback(async (nextStep: number, completed = false) => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      ...data,
      current_step: nextStep,
      onboarding_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
    };

    const { data: existing } = await supabase
      .from("onboarding_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from("onboarding_profiles").update(payload).eq("user_id", user.id);
    } else {
      await supabase.from("onboarding_profiles").insert(payload);
    }
    setSaving(false);
  }, [user, data]);

  const goNext = async () => {
    if (step < TOTAL_STEPS) {
      await saveProgress(step + 1);
      setStep(step + 1);
    }
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = async () => {
    await saveProgress(TOTAL_STEPS, true);
    // Notify coach
    if (user) {
      const { data: assignment } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (assignment) {
        // Find or create thread and send auto message
        const { data: thread } = await supabase
          .from("message_threads")
          .select("id")
          .eq("coach_id", assignment.coach_id)
          .eq("client_id", user.id)
          .maybeSingle();

        const threadId = thread?.id;
        if (threadId) {
          await supabase.from("thread_messages").insert({
            thread_id: threadId,
            sender_id: user.id,
            content: "✅ I've completed my onboarding profile! Ready to get started.",
          });
        }
      }
    }
    navigate("/dashboard", { replace: true });
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!data.primary_goal;
      case 2: return !!data.age && !!data.height_cm && !!data.current_weight_kg && !!data.activity_level;
      case 3: return data.tracked_macros_before !== null;
      case 4: return true; // skippable
      case 5: return true; // skip allowed
      case 6: return true;
      default: return false;
    }
  };

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progressPct = (step / TOTAL_STEPS) * 100;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg font-bold text-foreground">
              PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
            </h1>
            <span className="text-xs text-muted-foreground">
              Step {step} of {TOTAL_STEPS}
            </span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-lg mx-auto animate-fade-in">
          {step === 1 && <OnboardingGoals data={data} updateField={updateField} />}
          {step === 2 && <OnboardingMetrics data={data} updateField={updateField} />}
          {step === 3 && <OnboardingNutrition data={data} updateField={updateField} />}
          {step === 4 && <OnboardingTraining data={data} updateField={updateField} />}
          {step === 5 && <OnboardingHealthSync data={data} updateField={updateField} />}
          {step === 6 && <OnboardingSummary data={data} />}
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex gap-3">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button onClick={goNext} disabled={!canProceed() || saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {step === 4 ? (data.injuries || data.surgeries ? "Next" : "Skip & Continue") : "Continue"}
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

export default Onboarding;
