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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, Copy, Send } from "lucide-react";

const QUESTION_TYPES = [
  { value: "text", label: "Text Response" },
  { value: "multiple_choice", label: "Multiple Choice" },
  { value: "scale", label: "Scale Rating" },
  { value: "yes_no", label: "Yes / No" },
  { value: "dropdown", label: "Dropdown" },
  { value: "numeric", label: "Numeric Entry" },
];

interface QuestionDraft {
  id: string;
  question_text: string;
  question_type: string;
  options: string[];
  scale_min: number;
  scale_max: number;
  is_required: boolean;
}

const CheckinFormBuilder = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showBuilder, setShowBuilder] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);

  // Assignment form
  const [showAssign, setShowAssign] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState("");
  const [assignClientId, setAssignClientId] = useState("");
  const [assignRecurrence, setAssignRecurrence] = useState("weekly");
  const [assignDay, setAssignDay] = useState("0");
  const [assignDeadline, setAssignDeadline] = useState("48");

  const { data: templates } = useQuery({
    queryKey: ["checkin-templates", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_templates")
        .select("*")
        .eq("coach_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: clients } = useQuery({
    queryKey: ["coach-clients-checkin", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user!.id)
        .eq("status", "active");
      if (!data) return [];
      const ids = data.map((c) => c.client_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return ids.map((id) => ({
        client_id: id,
        full_name: profiles?.find((p) => p.user_id === id)?.full_name || "Client",
      }));
    },
    enabled: !!user,
  });

  const { data: assignments } = useQuery({
    queryKey: ["checkin-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_assignments")
        .select("*, checkin_templates(name)")
        .eq("coach_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        question_text: "",
        question_type: "text",
        options: [""],
        scale_min: 1,
        scale_max: 10,
        is_required: true,
      },
    ]);
  };

  const updateQuestion = (id: string, field: string, value: any) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const addOption = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId ? { ...q, options: [...q.options, ""] } : q
      )
    );
  };

  const updateOption = (qId: string, idx: number, val: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: q.options.map((o, i) => (i === idx ? val : o)) }
          : q
      )
    );
  };

  const removeOption = (qId: string, idx: number) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: q.options.filter((_, i) => i !== idx) }
          : q
      )
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !templateName || questions.length === 0)
        throw new Error("Name and at least one question required");

      const { data: tmpl, error: tmplErr } = await supabase
        .from("checkin_templates")
        .insert({ coach_id: user.id, name: templateName, description: templateDesc || null })
        .select()
        .single();
      if (tmplErr) throw tmplErr;

      const qInserts = questions.map((q, i) => ({
        template_id: tmpl.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: ["multiple_choice", "dropdown"].includes(q.question_type) ? q.options : null,
        scale_min: q.question_type === "scale" ? q.scale_min : null,
        scale_max: q.question_type === "scale" ? q.scale_max : null,
        is_required: q.is_required,
        question_order: i,
      }));

      const { error: qErr } = await supabase.from("checkin_questions").insert(qInserts);
      if (qErr) throw qErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-templates"] });
      toast({ title: "Template saved ✅" });
      setShowBuilder(false);
      setTemplateName("");
      setTemplateDesc("");
      setQuestions([]);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!user || !assignTemplateId || !assignClientId)
        throw new Error("Select template and client");

      const { error } = await supabase.from("checkin_assignments").insert({
        template_id: assignTemplateId,
        coach_id: user.id,
        client_id: assignClientId,
        recurrence: assignRecurrence,
        day_of_week: parseInt(assignDay),
        deadline_hours: parseInt(assignDeadline),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-assignments"] });
      toast({ title: "Check-in assigned" });
      setShowAssign(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getClientName = (clientId: string) =>
    clients?.find((c) => c.client_id === clientId)?.full_name || "Client";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Check-In Forms</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAssign(!showAssign)}>
            <Send className="h-4 w-4 mr-1" /> Assign
          </Button>
          <Button size="sm" onClick={() => { setShowBuilder(!showBuilder); if (!showBuilder) addQuestion(); }}>
            <Plus className="h-4 w-4 mr-1" /> New Template
          </Button>
        </div>
      </div>

      {/* Template Builder */}
      {showBuilder && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Build Check-In Form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Weekly Check-In" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} placeholder="Standard weekly form" />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Questions</Label>
              {questions.map((q, idx) => (
                <Card key={q.id} className="border-dashed">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-5 w-5 text-muted-foreground mt-2 shrink-0" />
                      <div className="flex-1 space-y-3">
                        <div className="flex gap-2">
                          <Input
                            value={q.question_text}
                            onChange={(e) => updateQuestion(q.id, "question_text", e.target.value)}
                            placeholder={`Question ${idx + 1}`}
                            className="flex-1"
                          />
                          <Select value={q.question_type} onValueChange={(v) => updateQuestion(q.id, "question_type", v)}>
                            <SelectTrigger className="w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {QUESTION_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Options for multiple_choice / dropdown */}
                        {["multiple_choice", "dropdown"].includes(q.question_type) && (
                          <div className="space-y-2 pl-4">
                            {q.options.map((opt, oi) => (
                              <div key={oi} className="flex gap-2">
                                <Input
                                  value={opt}
                                  onChange={(e) => updateOption(q.id, oi, e.target.value)}
                                  placeholder={`Option ${oi + 1}`}
                                  className="flex-1"
                                />
                                {q.options.length > 1 && (
                                  <Button size="icon" variant="ghost" onClick={() => removeOption(q.id, oi)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            <Button size="sm" variant="ghost" onClick={() => addOption(q.id)}>
                              <Plus className="h-3 w-3 mr-1" /> Add Option
                            </Button>
                          </div>
                        )}

                        {/* Scale config */}
                        {q.question_type === "scale" && (
                          <div className="flex gap-4 pl-4">
                            <div className="space-y-1">
                              <Label className="text-xs">Min</Label>
                              <Input type="number" value={q.scale_min} onChange={(e) => updateQuestion(q.id, "scale_min", parseInt(e.target.value))} className="w-20" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Max</Label>
                              <Input type="number" value={q.scale_max} onChange={(e) => updateQuestion(q.id, "scale_max", parseInt(e.target.value))} className="w-20" />
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Switch checked={q.is_required} onCheckedChange={(v) => updateQuestion(q.id, "is_required", v)} />
                          <Label className="text-xs">Required</Label>
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeQuestion(q.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button size="sm" variant="outline" onClick={addQuestion}>
                <Plus className="h-4 w-4 mr-1" /> Add Question
              </Button>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={!templateName || questions.length === 0}>
                Save Template
              </Button>
              <Button variant="outline" onClick={() => setShowBuilder(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assignment Form */}
      {showAssign && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assign Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={assignTemplateId} onValueChange={setAssignTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {templates?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={assignClientId} onValueChange={setAssignClientId}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.client_id} value={c.client_id}>{c.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Recurrence</Label>
                <Select value={assignRecurrence} onValueChange={setAssignRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Biweekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="one_time">One Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Deadline (hours)</Label>
                <Input type="number" value={assignDeadline} onChange={(e) => setAssignDeadline(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => assignMutation.mutate()} disabled={!assignTemplateId || !assignClientId}>
                Assign
              </Button>
              <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Templates */}
      {templates && templates.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{t.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {t.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Active Assignments */}
      {assignments && assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Active Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assignments.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{a.checkin_templates?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getClientName(a.client_id)} · {a.recurrence} · Due: {a.next_due_date}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{a.recurrence}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CheckinFormBuilder;
