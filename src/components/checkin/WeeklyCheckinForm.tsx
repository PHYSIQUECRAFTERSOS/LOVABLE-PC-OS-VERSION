import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, CheckCircle, Loader2, Star } from "lucide-react";
import { useXPAward } from "@/hooks/useXPAward";
import { XP_VALUES } from "@/utils/rankedXP";

const HARDCODED_FALLBACK_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001";

const WeeklyCheckinForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { triggerXP } = useXPAward();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitted, setSubmitted] = useState(false);

  // Resolve the template: look up coach's default first, then fallback
  const { data: resolvedTemplateId, isLoading: templateResolving } = useQuery({
    queryKey: ["resolved-checkin-template", user?.id],
    queryFn: async () => {
      // Find this client's coach
      const { data: coachRel } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", user!.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (coachRel?.coach_id) {
        // Check coach's preferences for a default template
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

  // Check if already submitted this week
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

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user || !questions || !resolvedTemplateId) throw new Error("Not ready");

      const missing = questions.filter(
        (q) => q.is_required && (!answers[q.id] || (typeof answers[q.id] === "string" && answers[q.id].trim() === ""))
      );
      if (missing.length > 0) {
        throw new Error(`Please complete all required fields (${missing.length} remaining)`);
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
      await supabase
        .from("calendar_events")
        .update({ is_completed: true, completed_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("event_date", today)
        .eq("event_type", "checkin")
        .eq("is_completed", false);
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
    switch (q.question_type) {
      case "text":
        return (
          <Input
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="Type your response..."
          />
        );
      case "paragraph":
        return (
          <Textarea
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            rows={3}
            placeholder="Type your response..."
            className="resize-none"
          />
        );
      case "numeric":
        return (
          <Input
            type="number"
            step="0.1"
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
            placeholder="Enter a number"
          />
        );
      case "scale":
        return (
          <div className="space-y-3 pt-1">
            <Slider
              value={[answers[q.id]?.[0] ?? answers[q.id] ?? q.scale_min ?? 1]}
              onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              min={q.scale_min ?? 1}
              max={q.scale_max ?? 10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{q.scale_min ?? 1}</span>
              <span className="text-base font-bold text-primary">
                {Array.isArray(answers[q.id]) ? answers[q.id][0] : (answers[q.id] ?? q.scale_min ?? 1)}
              </span>
              <span>{q.scale_max ?? 10}</span>
            </div>
          </div>
        );
      case "rating": {
        const max = q.scale_max ?? 5;
        const current = answers[q.id] ?? 0;
        return (
          <div className="flex gap-1">
            {Array.from({ length: max }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i + 1 }))}
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
              checked={answers[q.id] || false}
              onCheckedChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            />
            <span className="text-sm">{answers[q.id] ? "Yes" : "No"}</span>
          </div>
        );
      case "multiple_choice": {
        const options = (q.options as string[]) || [];
        return (
          <RadioGroup
            value={answers[q.id] || ""}
            onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            className="space-y-2"
          >
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <RadioGroupItem value={opt} id={`${q.id}-${i}`} />
                <Label htmlFor={`${q.id}-${i}`} className="text-sm cursor-pointer flex-1">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      }
      case "checkbox": {
        const options = (q.options as string[]) || [];
        const selected: string[] = answers[q.id] || [];
        return (
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                <Checkbox
                  checked={selected.includes(opt)}
                  onCheckedChange={(checked) => {
                    setAnswers((prev) => ({
                      ...prev,
                      [q.id]: checked
                        ? [...(prev[q.id] || []), opt]
                        : (prev[q.id] || []).filter((s: string) => s !== opt),
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
          <Select value={answers[q.id] || ""} onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
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
      </CardHeader>
      <CardContent className="space-y-6">
        {questions?.map((q, idx) => (
          <div key={q.id} className="space-y-2">
            <Label className="text-sm leading-relaxed">
              <span className="text-muted-foreground mr-2">{idx + 1}.</span>
              {q.question_text}
              {q.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            {renderInput(q)}
          </div>
        ))}

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
