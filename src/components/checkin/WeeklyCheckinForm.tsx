import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, CheckCircle, Loader2, Star, AlertCircle } from "lucide-react";
import { useXPAward } from "@/hooks/useXPAward";
import { XP_VALUES } from "@/utils/rankedXP";
import { invalidateCache } from "@/hooks/useDataFetch";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";

const HARDCODED_FALLBACK_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001";

const WeeklyCheckinForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { triggerXP } = useXPAward();
  const { parseWeightInput } = useUnitPreferences();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Resolve the template: look up coach's default first, then fallback
  const { data: resolvedTemplateId, isLoading: templateResolving } = useQuery({
    queryKey: ["resolved-checkin-template", user?.id],
    queryFn: async () => {
      const { data: coachRel } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", user!.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (coachRel?.coach_id) {
        const { data: prefs } = await supabase
          .from("coach_checkin_preferences")
          .select("default_template_id")
          .eq("coach_id", coachRel.coach_id)
          .maybeSingle();

        if (prefs?.default_template_id) {
          return prefs.default_template_id;
        }
      }
      return HARDCODED_FALLBACK_TEMPLATE_ID;
    },
    enabled: !!user,
  });

  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ["weekly-checkin-questions", resolvedTemplateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_questions")
        .select("*")
        .eq("template_id", resolvedTemplateId!)
        .order("question_order");
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!resolvedTemplateId,
  });

  // Pre-populate default values for scale/rating questions so validation doesn't miss them
  useEffect(() => {
    if (!questions) return;
    setAnswers((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const q of questions) {
        if (q.question_type === "scale" && updated[q.id] === undefined) {
          updated[q.id] = [q.scale_min ?? 1];
          changed = true;
        }
        if (q.question_type === "rating" && updated[q.id] === undefined) {
          // rating starts at 0 (no selection) — user must pick
        }
      }
      return changed ? updated : prev;
    });
  }, [questions]);

  const { data: assignedAt } = useQuery({
    queryKey: ["client-assigned-at", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_clients")
        .select("assigned_at")
        .eq("client_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data?.assigned_at || null;
    },
    enabled: !!user,
  });

  const { data: alreadySubmitted } = useQuery({
    queryKey: ["weekly-checkin-status", user?.id, resolvedTemplateId],
    queryFn: async () => {
      const now = new Date();
      const pstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const pstDateStr = pstFormatter.format(now);
      const pstDate = new Date(pstDateStr + "T00:00:00");
      const day = pstDate.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(pstDate);
      monday.setDate(monday.getDate() + diffToMonday);
      const mondayStr = monday.toISOString().split("T")[0];

      const { data } = await supabase
        .from("checkin_submissions")
        .select("id")
        .eq("client_id", user!.id)
        .eq("template_id", resolvedTemplateId!)
        .gte("submitted_at", `${mondayStr}T00:00:00Z`)
        .limit(1);
      return (data || []).length > 0;
    },
    enabled: !!user && !!resolvedTemplateId,
  });

  const getWeekNumber = () => {
    if (!assignedAt) return 1;
    const now = new Date();
    const start = new Date(assignedAt);
    const diff = now.getTime() - start.getTime();
    return Math.max(1, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1);
  };

  const getPSTTime = () => {
    return new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  };

  // --- Validation helpers ---
  const isFieldEmpty = useCallback((q: any, answer: any): boolean => {
    if (answer === undefined || answer === null) return true;
    if (typeof answer === "string" && answer.trim() === "") return true;
    if (q.question_type === "rating" && answer === 0) return true;
    if (q.question_type === "checkbox" && Array.isArray(answer) && answer.length === 0) return true;
    return false;
  }, []);

  const missingRequired = useMemo(() => {
    if (!questions) return [];
    return questions.filter((q) => q.is_required && isFieldEmpty(q, answers[q.id]));
  }, [questions, answers, isFieldEmpty]);

  const requiredCount = useMemo(() => {
    return questions?.filter((q) => q.is_required).length ?? 0;
  }, [questions]);

  const answeredRequiredCount = requiredCount - missingRequired.length;
  const progressPct = requiredCount > 0 ? (answeredRequiredCount / requiredCount) * 100 : 100;

  const shouldShowError = useCallback((qId: string) => {
    return (attemptedSubmit || touchedFields.has(qId)) && missingRequired.some((q) => q.id === qId);
  }, [attemptedSubmit, touchedFields, missingRequired]);

  const handleBlur = useCallback((qId: string) => {
    setTouchedFields((prev) => {
      const next = new Set(prev);
      next.add(qId);
      return next;
    });
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user || !questions || !resolvedTemplateId) throw new Error("Not ready");

      if (missingRequired.length > 0) {
        setAttemptedSubmit(true);
        // Scroll to first missing field
        const firstMissing = missingRequired[0];
        const el = questionRefs.current[firstMissing.id];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        const firstName = firstMissing.question_text;
        const msg = missingRequired.length === 1
          ? `Please complete: ${firstName}`
          : `Please complete: ${firstName} and ${missingRequired.length - 1} more required field${missingRequired.length - 1 > 1 ? "s" : ""}`;
        throw new Error(msg);
      }

      const now = new Date().toISOString();
      const { data: sub, error: subErr } = await supabase
        .from("checkin_submissions")
        .insert({
          client_id: user.id,
          template_id: resolvedTemplateId,
          due_date: new Date().toISOString().split("T")[0],
          submitted_at: now,
          submitted_at_pst: getPSTTime(),
          week_number: getWeekNumber(),
          status: "submitted",
        })
        .select()
        .single();
      if (subErr) throw subErr;

      const responses = questions.map((q) => {
        const ans = answers[q.id];
        return {
          submission_id: sub.id,
          question_id: q.id,
          answer_text: ["text", "paragraph"].includes(q.question_type) ? (ans || null) : null,
          answer_numeric: q.question_type === "numeric" ? (ans ? parseFloat(ans) : null) : null,
          answer_scale: ["scale", "rating"].includes(q.question_type) ? (Array.isArray(ans) ? ans[0] : ans || null) : null,
          answer_boolean: q.question_type === "yes_no" ? ans : null,
          answer_choice: ["multiple_choice", "dropdown", "checkbox"].includes(q.question_type)
            ? (Array.isArray(ans) ? JSON.stringify(ans) : (ans || null))
            : null,
        };
      });

      const { error: rErr } = await supabase.from("checkin_responses").insert(responses);
      if (rErr) throw rErr;

      // Log weight if applicable
      const weightQ = questions.find((q) => q.question_order === 10);
      if (weightQ && answers[weightQ.id]) {
        const w = parseFloat(answers[weightQ.id]);
        if (!isNaN(w)) {
          await supabase.from("weight_logs").upsert({
            client_id: user.id,
            weight: w,
          }, { onConflict: "client_id,logged_at" });
        }
      }

      // Mark calendar check-in event as completed for today
      const today = new Date().toLocaleDateString("en-CA");
      const completionPayload = { is_completed: true, completed_at: new Date().toISOString() };
      await Promise.all([
        supabase
          .from("calendar_events")
          .update(completionPayload)
          .eq("user_id", user.id)
          .eq("event_date", today)
          .eq("event_type", "checkin")
          .eq("is_completed", false),
        supabase
          .from("calendar_events")
          .update(completionPayload)
          .eq("target_client_id", user.id)
          .eq("event_date", today)
          .eq("event_type", "checkin")
          .eq("is_completed", false),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-checkin-status"] });
      queryClient.invalidateQueries({ queryKey: ["client-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["today-actions"] });
      toast({ title: "Check-in submitted! 💪" });
      if (user?.id) {
        triggerXP(user.id, "checkin_submitted", XP_VALUES.checkin_submitted, "Weekly check-in submitted").catch(console.error);
        invalidateCache(`today-actions-${user.id}-${new Date().toLocaleDateString("en-CA")}`);
      }
      setSubmitted(true);
      onSubmitted?.();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renderInput = (q: any) => {
    const qId = q.id;
    const hasError = shouldShowError(qId);
    const errorBorder = hasError ? "border-[#FF4444] ring-1 ring-[#FF4444]/30" : "";

    switch (q.question_type) {
      case "text":
        return (
          <Input
            value={answers[qId] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [qId]: e.target.value }))}
            onBlur={() => handleBlur(qId)}
            placeholder="Type your response..."
            className={errorBorder}
          />
        );
      case "paragraph":
        return (
          <Textarea
            value={answers[qId] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [qId]: e.target.value }))}
            onBlur={() => handleBlur(qId)}
            rows={3}
            placeholder="Type your response..."
            className={`resize-none ${errorBorder}`}
          />
        );
      case "numeric":
        return (
          <Input
            type="number"
            step="0.1"
            value={answers[qId] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [qId]: e.target.value }))}
            onBlur={() => handleBlur(qId)}
            placeholder="Enter a number"
            className={errorBorder}
          />
        );
      case "scale":
        return (
          <div className="space-y-3 pt-1">
            <Slider
              value={[answers[qId]?.[0] ?? answers[qId] ?? q.scale_min ?? 1]}
              onValueChange={(v) => setAnswers((prev) => ({ ...prev, [qId]: v }))}
              min={q.scale_min ?? 1}
              max={q.scale_max ?? 10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{q.scale_min ?? 1}</span>
              <span className="text-base font-bold text-primary">
                {Array.isArray(answers[qId]) ? answers[qId][0] : (answers[qId] ?? q.scale_min ?? 1)}
              </span>
              <span>{q.scale_max ?? 10}</span>
            </div>
          </div>
        );
      case "rating": {
        const max = q.scale_max ?? 5;
        const current = answers[qId] ?? 0;
        return (
          <div className={`flex gap-1 ${hasError ? "p-1 rounded border border-[#FF4444]" : ""}`}>
            {Array.from({ length: max }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [qId]: i + 1 }))}
                className="transition-colors"
              >
                <Star
                  className={`h-7 w-7 ${i < current ? "text-primary fill-primary" : "text-muted-foreground/30"}`}
                />
              </button>
            ))}
          </div>
        );
      }
      case "yes_no":
        return (
          <div className="flex items-center gap-3">
            <Switch
              checked={answers[qId] || false}
              onCheckedChange={(v) => setAnswers((prev) => ({ ...prev, [qId]: v }))}
            />
            <span className="text-sm">{answers[qId] ? "Yes" : "No"}</span>
          </div>
        );
      case "multiple_choice": {
        const options = (q.options as string[]) || [];
        return (
          <RadioGroup
            value={answers[qId] || ""}
            onValueChange={(v) => setAnswers((prev) => ({ ...prev, [qId]: v }))}
            className={`space-y-2 ${hasError ? "p-2 rounded border border-[#FF4444]" : ""}`}
          >
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <RadioGroupItem value={opt} id={`${qId}-${i}`} />
                <Label htmlFor={`${qId}-${i}`} className="text-sm cursor-pointer flex-1">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      }
      case "checkbox": {
        const options = (q.options as string[]) || [];
        const selected: string[] = answers[qId] || [];
        return (
          <div className={`space-y-2 ${hasError ? "p-2 rounded border border-[#FF4444]" : ""}`}>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={(checked) => {
                    setAnswers((prev) => ({
                      ...prev,
                      [qId]: checked
                        ? [...(prev[qId] || []), opt]
                        : (prev[qId] || []).filter((s: string) => s !== opt),
                    }));
                  }}
                />
                <Label className="text-sm cursor-pointer flex-1">{opt}</Label>
              </div>
            ))}
          </div>
        );
      }
      case "dropdown": {
        const options = (q.options as string[]) || [];
        return (
          <Select value={answers[qId] || ""} onValueChange={(v) => setAnswers((prev) => ({ ...prev, [qId]: v }))}>
            <SelectTrigger className={errorBorder}><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {options.map((opt, i) => (
                <SelectItem key={i} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }
      default:
        return null;
    }
  };

  if (alreadySubmitted || submitted) {
    return (
      <Card className="border-primary/20">
        <CardContent className="pt-6 text-center space-y-2">
          <CheckCircle className="h-10 w-10 text-primary mx-auto" />
          <p className="font-semibold text-foreground">Weekly Check-In Submitted</p>
          <p className="text-sm text-muted-foreground">You've already submitted your check-in for this week. Great job! 💪</p>
        </CardContent>
      </Card>
    );
  }

  if (questionsLoading || templateResolving) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" /> Weekly Check-In
        </CardTitle>
        <p className="text-sm text-muted-foreground">Take a few minutes to reflect on your week. Your coach reviews every response.</p>

        {/* Progress indicator */}
        {requiredCount > 0 && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {answeredRequiredCount} of {requiredCount} required questions answered
              </span>
              {answeredRequiredCount === requiredCount && (
                <span className="text-primary font-medium">Ready to submit ✓</span>
              )}
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Error banner */}
        {attemptedSubmit && missingRequired.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-4 w-4 text-[#FF4444] mt-0.5 shrink-0" />
            <p className="text-sm text-[#FF4444]">
              {missingRequired.length === 1
                ? `Please complete: ${missingRequired[0].question_text}`
                : `Please complete: ${missingRequired[0].question_text} and ${missingRequired.length - 1} more required field${missingRequired.length - 1 > 1 ? "s" : ""}`
              }
            </p>
          </div>
        )}

        {questions?.map((q, idx) => {
          const hasError = shouldShowError(q.id);
          return (
            <div
              key={q.id}
              ref={(el) => { questionRefs.current[q.id] = el; }}
              className="space-y-2"
            >
              <Label className={`text-sm leading-relaxed ${hasError ? "text-[#FF4444]" : ""}`}>
                <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                {q.question_text}
                {q.is_required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {renderInput(q)}
              {hasError && (
                <p className="text-[#FF4444] text-xs mt-1">This field is required</p>
              )}
            </div>
          );
        })}

        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="w-full"
          size="lg"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Check-In"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default WeeklyCheckinForm;
