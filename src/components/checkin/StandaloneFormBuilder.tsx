import { useState } from "react";
import SearchableClientSelect from "@/components/ui/searchable-client-select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, GripVertical, Star, FileText, Send,
  CheckCircle2, ArrowUp, ArrowDown, Copy, Loader2,
} from "lucide-react";

const QUESTION_TYPES = [
  { value: "text", label: "Short Answer", icon: "✏️" },
  { value: "paragraph", label: "Paragraph", icon: "📝" },
  { value: "multiple_choice", label: "Multiple Choice", icon: "🔘" },
  { value: "checkbox", label: "Checkbox", icon: "☑️" },
  { value: "dropdown", label: "Dropdown", icon: "📋" },
  { value: "scale", label: "Linear Scale", icon: "📊" },
  { value: "rating", label: "Star Rating", icon: "⭐" },
  { value: "numeric", label: "Numeric Entry", icon: "🔢" },
  { value: "yes_no", label: "Yes / No", icon: "✅" },
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

const StandaloneFormBuilder = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});

  // Assignment form state
  const [showAssign, setShowAssign] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState("");
  const [assignClientId, setAssignClientId] = useState("");
  const [assignRecurrence, setAssignRecurrence] = useState("weekly");
  const [assignDeadline, setAssignDeadline] = useState("48");

  // Fetch templates
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

  // Fetch coach preferences
  const { data: preferences } = useQuery({
    queryKey: ["coach-checkin-preferences", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_checkin_preferences")
        .select("*")
        .eq("coach_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch clients
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

  // Fetch assignments
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

  // ── Question management ──
  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        question_text: "",
        question_type: "text",
        options: ["Option 1"],
        scale_min: 1,
        scale_max: 5,
        is_required: false,
      },
    ]);
  };

  const updateQuestion = (id: string, field: string, value: any) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const duplicateQuestion = (idx: number) => {
    setQuestions((prev) => {
      const q = { ...prev[idx], id: crypto.randomUUID(), options: [...prev[idx].options] };
      const arr = [...prev];
      arr.splice(idx + 1, 0, q);
      return arr;
    });
  };

  const addOption = (qId: string) => {
    setQuestions((prev) =>
      prev.map((q) => q.id === qId ? { ...q, options: [...q.options, `Option ${q.options.length + 1}`] } : q)
    );
  };

  const updateOption = (qId: string, idx: number, val: string) => {
    setQuestions((prev) =>
      prev.map((q) => q.id === qId ? { ...q, options: q.options.map((o, i) => (i === idx ? val : o)) } : q)
    );
  };

  const removeOption = (qId: string, idx: number) => {
    setQuestions((prev) =>
      prev.map((q) => q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q)
    );
  };

  // ── Load template for editing ──
  const loadTemplate = async (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;

    const { data: qs } = await supabase
      .from("checkin_questions")
      .select("*")
      .eq("template_id", templateId)
      .order("question_order");

    setEditingTemplateId(templateId);
    setTemplateName(template.name);
    setTemplateDesc(template.description || "");
    setQuestions(
      (qs || []).map(q => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: (q.options as string[]) || ["Option 1"],
        scale_min: q.scale_min ?? 1,
        scale_max: q.scale_max ?? 5,
        is_required: q.is_required,
      }))
    );
  };

  // ── Save template ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user || !templateName.trim() || questions.length === 0)
        throw new Error("Name and at least one question required");

      let templateId = editingTemplateId;

      if (editingTemplateId) {
        // Update existing template
        const { error } = await supabase
          .from("checkin_templates")
          .update({ name: templateName.trim(), description: templateDesc || null })
          .eq("id", editingTemplateId);
        if (error) throw error;

        // Delete old questions and re-insert
        await supabase.from("checkin_questions").delete().eq("template_id", editingTemplateId);
      } else {
        // Create new
        const { data: tmpl, error: tmplErr } = await supabase
          .from("checkin_templates")
          .insert({ coach_id: user.id, name: templateName.trim(), description: templateDesc || null })
          .select()
          .single();
        if (tmplErr) throw tmplErr;
        templateId = tmpl.id;
      }

      const qInserts = questions.map((q, i) => ({
        template_id: templateId!,
        question_text: q.question_text,
        question_type: q.question_type,
        options: ["multiple_choice", "dropdown", "checkbox"].includes(q.question_type) ? q.options : null,
        scale_min: ["scale", "rating"].includes(q.question_type) ? q.scale_min : null,
        scale_max: ["scale", "rating"].includes(q.question_type) ? q.scale_max : null,
        is_required: q.is_required,
        question_order: i,
      }));

      const { error: qErr } = await supabase.from("checkin_questions").insert(qInserts);
      if (qErr) throw qErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-templates"] });
      toast({ title: editingTemplateId ? "Template updated ✅" : "Template created ✅" });
      resetBuilder();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Set as default template
  const setDefaultMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from("coach_checkin_preferences")
        .upsert(
          { coach_id: user!.id, default_template_id: templateId, updated_at: new Date().toISOString() },
          { onConflict: "coach_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-checkin-preferences"] });
      toast({ title: "Default template updated ✅" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Assign check-in
  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!user || !assignTemplateId || !assignClientId)
        throw new Error("Select template and client");
      const { error } = await supabase.from("checkin_assignments").insert({
        template_id: assignTemplateId,
        coach_id: user.id,
        client_id: assignClientId,
        recurrence: assignRecurrence,
        deadline_hours: parseInt(assignDeadline),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-assignments"] });
      toast({ title: "Check-in assigned ✅" });
      setShowAssign(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const resetBuilder = () => {
    setEditingTemplateId(null);
    setTemplateName("");
    setTemplateDesc("");
    setQuestions([]);
    setShowPreview(false);
    setPreviewAnswers({});
  };

  const isBuilding = templateName || questions.length > 0;

  const getClientName = (clientId: string) =>
    clients?.find((c) => c.client_id === clientId)?.full_name || "Client";

  // ── Preview renderer ──
  const renderPreviewInput = (q: QuestionDraft) => {
    switch (q.question_type) {
      case "text":
        return <Input placeholder="Short answer text" disabled className="bg-secondary/20" />;
      case "paragraph":
        return <Textarea placeholder="Long answer text" rows={3} disabled className="bg-secondary/20 resize-none" />;
      case "numeric":
        return <Input type="number" placeholder="0" disabled className="bg-secondary/20 w-32" />;
      case "scale":
        return (
          <div className="space-y-2 pt-1">
            <Slider value={[q.scale_min]} min={q.scale_min} max={q.scale_max} step={1} disabled />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{q.scale_min}</span>
              <span>{q.scale_max}</span>
            </div>
          </div>
        );
      case "rating":
        return (
          <div className="flex gap-1">
            {Array.from({ length: q.scale_max }, (_, i) => (
              <Star key={i} className="h-6 w-6 text-muted-foreground/30" />
            ))}
          </div>
        );
      case "yes_no":
        return (
          <div className="flex items-center gap-3">
            <Switch disabled />
            <span className="text-sm text-muted-foreground">Yes / No</span>
          </div>
        );
      case "multiple_choice":
        return (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50">
                <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                <span className="text-sm text-muted-foreground">{opt || `Option ${i + 1}`}</span>
              </div>
            ))}
          </div>
        );
      case "checkbox":
        return (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50">
                <Checkbox disabled />
                <span className="text-sm text-muted-foreground">{opt || `Option ${i + 1}`}</span>
              </div>
            ))}
          </div>
        );
      case "dropdown":
        return (
          <Select disabled>
            <SelectTrigger className="w-full bg-secondary/20">
              <SelectValue placeholder="Select an option..." />
            </SelectTrigger>
          </Select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Check-In Form Builder</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAssign(!showAssign)}>
            <Send className="h-4 w-4 mr-1" /> Assign
          </Button>
          {!isBuilding && (
            <Button size="sm" onClick={() => { resetBuilder(); addQuestion(); }}>
              <Plus className="h-4 w-4 mr-1" /> New Form
            </Button>
          )}
        </div>
      </div>

      {/* ── Assignment Form ── */}
      {showAssign && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Assign Check-In</CardTitle></CardHeader>
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
                <SearchableClientSelect
                  clients={(clients || []).map(c => ({ id: c.client_id, name: c.full_name }))}
                  value={assignClientId}
                  onValueChange={setAssignClientId}
                  placeholder="Select client"
                />
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
              <Button onClick={() => assignMutation.mutate()} disabled={!assignTemplateId || !assignClientId}>Assign</Button>
              <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Builder ── */}
      {isBuilding && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {editingTemplateId ? "Edit Form" : "New Check-In Form"}
              </CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowPreview(!showPreview)}>
                  {showPreview ? "Edit" : "Preview"}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetBuilder}>Cancel</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Form Name</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Weekly Check-In"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="Brief description for clients"
                />
              </div>
            </div>

            <Separator />

            {showPreview ? (
              /* ── Preview Mode ── */
              <div className="space-y-6 max-w-xl">
                <div>
                  <h3 className="text-lg font-semibold">{templateName || "Untitled Form"}</h3>
                  {templateDesc && <p className="text-sm text-muted-foreground mt-1">{templateDesc}</p>}
                </div>
                {questions.map((q, idx) => (
                  <div key={q.id} className="space-y-2">
                    <Label className="text-sm leading-relaxed">
                      <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                      {q.question_text || "Untitled question"}
                      {q.is_required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {renderPreviewInput(q)}
                  </div>
                ))}
              </div>
            ) : (
              /* ── Edit Mode ── */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Questions ({questions.length})</Label>
                  <Button size="sm" variant="outline" onClick={addQuestion}>
                    <Plus className="h-4 w-4 mr-1" /> Add Question
                  </Button>
                </div>

                {questions.map((q, idx) => (
                  <Card key={q.id} className="border-dashed border-border/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-1 mt-1">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="flex-1 space-y-3">
                          <div className="flex gap-2">
                            <Input
                              value={q.question_text}
                              onChange={(e) => updateQuestion(q.id, "question_text", e.target.value)}
                              placeholder={`Question ${idx + 1}`}
                              className="flex-1"
                            />
                            <Select value={q.question_type} onValueChange={(v) => updateQuestion(q.id, "question_type", v)}>
                              <SelectTrigger className="w-[170px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {QUESTION_TYPES.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    <span className="mr-2">{t.icon}</span>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Options for choice-based questions */}
                          {["multiple_choice", "dropdown", "checkbox"].includes(q.question_type) && (
                            <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                              {q.options.map((opt, oi) => (
                                <div key={oi} className="flex gap-2 items-center">
                                  {q.question_type === "checkbox" ? (
                                    <Checkbox disabled className="shrink-0" />
                                  ) : q.question_type === "multiple_choice" ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                                  ) : null}
                                  <Input
                                    value={opt}
                                    onChange={(e) => updateOption(q.id, oi, e.target.value)}
                                    placeholder={`Option ${oi + 1}`}
                                    className="flex-1"
                                  />
                                  {q.options.length > 1 && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeOption(q.id, oi)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              <Button size="sm" variant="ghost" onClick={() => addOption(q.id)} className="text-xs">
                                <Plus className="h-3 w-3 mr-1" /> Add Option
                              </Button>
                            </div>
                          )}

                          {/* Scale / Rating config */}
                          {["scale", "rating"].includes(q.question_type) && (
                            <div className="flex gap-4 pl-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Min</Label>
                                <Input
                                  type="number"
                                  value={q.scale_min}
                                  onChange={(e) => updateQuestion(q.id, "scale_min", parseInt(e.target.value) || 1)}
                                  className="w-20"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Max</Label>
                                <Input
                                  type="number"
                                  value={q.scale_max}
                                  onChange={(e) => updateQuestion(q.id, "scale_max", parseInt(e.target.value) || 5)}
                                  className="w-20"
                                />
                              </div>
                              {q.question_type === "rating" && (
                                <div className="flex items-end gap-1 pb-1">
                                  {Array.from({ length: q.scale_max }, (_, i) => (
                                    <Star key={i} className="h-4 w-4 text-primary/40" />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Required toggle + actions */}
                          <div className="flex items-center gap-4 pt-1">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={q.is_required}
                                onCheckedChange={(v) => updateQuestion(q.id, "is_required", v)}
                              />
                              <Label className="text-xs text-muted-foreground">Required</Label>
                            </div>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateQuestion(idx)}>
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>

                        <Button size="icon" variant="ghost" className="shrink-0" onClick={() => removeQuestion(q.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button size="sm" variant="outline" onClick={addQuestion} className="w-full">
                  <Plus className="h-4 w-4 mr-1" /> Add Question
                </Button>
              </div>
            )}

            <Separator />

            <div className="flex gap-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!templateName.trim() || questions.length === 0 || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  editingTemplateId ? "Update Form" : "Save Form"
                )}
              </Button>
              <Button variant="outline" onClick={resetBuilder}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Existing Templates ── */}
      {templates && templates.length > 0 && !isBuilding && (
        <div>
          <Label className="text-sm font-medium text-muted-foreground mb-2 block">Your Forms</Label>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <Card key={t.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{t.name}</span>
                    <div className="flex items-center gap-1.5">
                      {preferences?.default_template_id === t.id && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary border-0">Default</Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {t.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mb-3">{t.description}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => loadTemplate(t.id)}>
                      Edit
                    </Button>
                    {preferences?.default_template_id !== t.id && (
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setDefaultMutation.mutate(t.id)}>
                        <Star className="h-3 w-3 mr-1" /> Set Default
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Active Assignments ── */}
      {assignments && assignments.length > 0 && !isBuilding && (
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

export default StandaloneFormBuilder;
