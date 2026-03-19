import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useXPAward } from "@/hooks/useXPAward";
import { XP_VALUES } from "@/utils/rankedXP";

const CheckinSubmissionForm = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { triggerXP } = useXPAward();
  const queryClient = useQueryClient();

  const [activeAssignment, setActiveAssignment] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  // Fetch join date for week number calculation
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

  // Fetch assignments - also check coach's default template
  const { data: coachDefaultTemplateId } = useQuery({
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
        if (prefs?.default_template_id) return prefs.default_template_id;
      }
      return null;
    },
    enabled: !!user,
  });

  const { data: assignments } = useQuery({
    queryKey: ["client-checkin-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_assignments")
        .select("*, checkin_templates(name, description)")
        .eq("client_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: questions } = useQuery({
    queryKey: ["checkin-questions", activeAssignment?.template_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_questions")
        .select("*")
        .eq("template_id", activeAssignment!.template_id)
        .order("question_order");
      if (error) throw error;
      return data;
    },
    enabled: !!activeAssignment,
  });

  const { data: pastSubmissions } = useQuery({
    queryKey: ["client-submissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_submissions")
        .select("*")
        .eq("client_id", user!.id)
        .order("due_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user || !activeAssignment) throw new Error("No assignment selected");

      // Create submission
      const now = new Date().toISOString();
      const { data: sub, error: subErr } = await supabase
        .from("checkin_submissions")
        .insert({
          assignment_id: activeAssignment.id,
          client_id: user.id,
          template_id: activeAssignment.template_id,
          due_date: activeAssignment.next_due_date,
          submitted_at: now,
          submitted_at_pst: getPSTTime(),
          week_number: getWeekNumber(),
          status: "submitted",
        })
        .select()
        .single();
      if (subErr) throw subErr;

      // Insert responses
      const responses = (questions || []).map((q) => {
        const ans = answers[q.id];
        return {
          submission_id: sub.id,
          question_id: q.id,
          answer_text: q.question_type === "text" ? ans || null : null,
          answer_numeric: q.question_type === "numeric" ? (ans ? parseFloat(ans) : null) : null,
          answer_scale: q.question_type === "scale" ? (ans ? ans[0] : null) : null,
          answer_boolean: q.question_type === "yes_no" ? ans : null,
          answer_choice: ["multiple_choice", "dropdown"].includes(q.question_type) ? ans || null : null,
        };
      });

      const { error: rErr } = await supabase.from("checkin_responses").insert(responses);
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-checkin-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["client-submissions"] });
      toast({ title: "Check-in submitted ✅" });
      if (user?.id) {
        triggerXP(user.id, "checkin_submitted", XP_VALUES.checkin_submitted, "Check-in submitted").catch(console.error);
      }
      setActiveAssignment(null);
      setAnswers({});
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const renderQuestionInput = (q: any) => {
    switch (q.question_type) {
      case "text":
        return (
          <Textarea
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            rows={2}
          />
        );
      case "numeric":
        return (
          <Input
            type="number"
            value={answers[q.id] || ""}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
          />
        );
      case "scale":
        return (
          <div className="space-y-2">
            <Slider
              value={answers[q.id] || [q.scale_min]}
              onValueChange={(v) => setAnswers({ ...answers, [q.id]: v })}
              min={q.scale_min}
              max={q.scale_max}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{q.scale_min}</span>
              <span className="font-medium text-foreground">{answers[q.id]?.[0] ?? q.scale_min}</span>
              <span>{q.scale_max}</span>
            </div>
          </div>
        );
      case "yes_no":
        return (
          <div className="flex items-center gap-3">
            <Switch
              checked={answers[q.id] || false}
              onCheckedChange={(v) => setAnswers({ ...answers, [q.id]: v })}
            />
            <span className="text-sm">{answers[q.id] ? "Yes" : "No"}</span>
          </div>
        );
      case "multiple_choice":
        return (
          <RadioGroup
            value={answers[q.id] || ""}
            onValueChange={(v) => setAnswers({ ...answers, [q.id]: v })}
          >
            {(q.options as string[])?.map((opt: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${q.id}-${i}`} />
                <Label htmlFor={`${q.id}-${i}`} className="text-sm">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "dropdown":
        return (
          <Select value={answers[q.id] || ""} onValueChange={(v) => setAnswers({ ...answers, [q.id]: v })}>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {(q.options as string[])?.map((opt: string, i: number) => (
                <SelectItem key={i} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  if (activeAssignment && questions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {activeAssignment.checkin_templates?.name || "Check-In"}
          </CardTitle>
          {activeAssignment.checkin_templates?.description && (
            <p className="text-sm text-muted-foreground">{activeAssignment.checkin_templates.description}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {questions.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <Label className="text-sm">
                {idx + 1}. {q.question_text}
                {q.is_required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {renderQuestionInput(q)}
            </div>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => submitMutation.mutate()} className="flex-1">Submit Check-In</Button>
            <Button variant="outline" onClick={() => setActiveAssignment(null)}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">My Check-Ins</h3>

      {/* Pending assignments */}
      {assignments && assignments.length > 0 ? (
        <div className="grid gap-3">
          {assignments.map((a: any) => (
            <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveAssignment(a)}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{a.checkin_templates?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Due: {a.next_due_date} · {a.recurrence}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" /> Pending
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No check-ins assigned yet.</p>
      )}

      {/* Past submissions */}
      {pastSubmissions && pastSubmissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pastSubmissions.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span className="text-sm">Check-in for {s.due_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "reviewed" ? "default" : "secondary"} className="text-xs">
                      {s.status}
                    </Badge>
                    {s.submitted_at && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(s.submitted_at), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CheckinSubmissionForm;
