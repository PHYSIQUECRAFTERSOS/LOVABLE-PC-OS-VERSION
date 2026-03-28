import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, Target, BookOpen, Loader2, ChevronDown, Pencil, RotateCcw, EyeOff, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import RichTextToolbar from "@/components/nutrition/RichTextToolbar";
import GuideSection from "@/components/nutrition/GuideSection";

const CATEGORIES = [
  { key: "hydration", label: "💧 Hydration", sections: ["water_recommendation"] },
  { key: "daily_habits", label: "☀️ Daily Habits", sections: ["daily_ritual"] },
  { key: "tracking", label: "📋 Tracking & Planning", sections: ["nutrition_tips", "meal_planning"] },
  { key: "eating_out", label: "🍽️ Eating Out", sections: ["eating_out_cheat_sheet", "eating_out_examples"] },
  { key: "reference", label: "📊 Reference", sections: ["macro_cheat_sheet"] },
];

const PlanTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    current_phase_name: "",
    current_phase_description: "",
    next_phase_name: "",
    next_phase_description: "",
    coach_notes: "",
    additional_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [overrideEditing, setOverrideEditing] = useState<Record<string, boolean>>({});
  const [overrideValues, setOverrideValues] = useState<Record<string, { content: string; title: string; is_hidden: boolean }>>({});
  const [savingOverride, setSavingOverride] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Fetch phase info for this client
  const { data: phaseInfo } = useQuery({
    queryKey: ["client-phase-info-edit", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_phase_info")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  // Fetch coach guide sections
  const { data: guideSections } = useQuery({
    queryKey: ["coach-guide-sections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_guide_sections")
        .select("*")
        .eq("coach_id", user!.id)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch existing overrides for this client
  const { data: existingOverrides } = useQuery({
    queryKey: ["client-guide-overrides", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_guide_overrides")
        .select("*")
        .eq("client_id", clientId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    if (phaseInfo) {
      setForm({
        current_phase_name: phaseInfo.current_phase_name || "",
        current_phase_description: phaseInfo.current_phase_description || "",
        next_phase_name: phaseInfo.next_phase_name || "",
        next_phase_description: phaseInfo.next_phase_description || "",
        coach_notes: phaseInfo.coach_notes || "",
        additional_notes: (phaseInfo as any).additional_notes || "",
      });
    } else {
      setForm({
        current_phase_name: "",
        current_phase_description: "",
        next_phase_name: "",
        next_phase_description: "",
        coach_notes: "",
        additional_notes: "",
      });
    }
  }, [phaseInfo, clientId]);

  // Initialize override values from existing data
  useEffect(() => {
    if (!existingOverrides) return;
    const vals: Record<string, { content: string; title: string; is_hidden: boolean }> = {};
    const editing: Record<string, boolean> = {};
    for (const ov of existingOverrides as any[]) {
      vals[ov.section_key] = {
        content: ov.content || "",
        title: ov.title || "",
        is_hidden: ov.is_hidden || false,
      };
      editing[ov.section_key] = true;
    }
    setOverrideValues(vals);
    setOverrideEditing(editing);
  }, [existingOverrides]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_phase_info")
        .upsert(
          {
            client_id: clientId,
            coach_id: user.id,
            ...form,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client-phase-info-edit", clientId] });
      toast.success("Phase info saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOverride = async (sectionKey: string) => {
    if (!user) return;
    setSavingOverride(sectionKey);
    const val = overrideValues[sectionKey];
    try {
      const { error } = await supabase
        .from("client_guide_overrides")
        .upsert(
          {
            client_id: clientId,
            coach_id: user.id,
            section_key: sectionKey,
            title: val?.title || null,
            content: val?.content || "",
            is_hidden: val?.is_hidden || false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,section_key" }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["client-guide-overrides", clientId] });
      toast.success("Override saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save override");
    } finally {
      setSavingOverride(null);
    }
  };

  const handleResetOverride = async (sectionKey: string) => {
    if (!user) return;
    setSavingOverride(sectionKey);
    try {
      const { error } = await supabase
        .from("client_guide_overrides")
        .delete()
        .eq("client_id", clientId)
        .eq("section_key", sectionKey);
      if (error) throw error;
      setOverrideEditing((prev) => ({ ...prev, [sectionKey]: false }));
      setOverrideValues((prev) => {
        const next = { ...prev };
        delete next[sectionKey];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["client-guide-overrides", clientId] });
      toast.success("Reset to default");
    } catch (e: any) {
      toast.error(e.message || "Failed to reset");
    } finally {
      setSavingOverride(null);
    }
  };

  const enableOverride = (sectionKey: string, masterContent: string, masterTitle: string) => {
    setOverrideEditing((prev) => ({ ...prev, [sectionKey]: true }));
    if (!overrideValues[sectionKey]) {
      setOverrideValues((prev) => ({
        ...prev,
        [sectionKey]: { content: masterContent, title: "", is_hidden: false },
      }));
    }
  };

  const updateOverride = (sectionKey: string, field: string, value: any) => {
    setOverrideValues((prev) => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], [field]: value },
    }));
  };

  // Build visible guide sections grouped by category
  const visibleGuides = (guideSections || []).filter((s: any) => s.is_visible);

  return (
    <div className="space-y-6">
      {/* Phase Info Section */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            Phase Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Current Phase Name</Label>
              <Input
                value={form.current_phase_name}
                onChange={(e) => setForm((f) => ({ ...f, current_phase_name: e.target.value }))}
                placeholder="e.g. Cut Phase"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Next Phase Name</Label>
              <Input
                value={form.next_phase_name}
                onChange={(e) => setForm((f) => ({ ...f, next_phase_name: e.target.value }))}
                placeholder="e.g. Maintenance"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Current Phase Description</Label>
            <Textarea
              value={form.current_phase_description}
              onChange={(e) => setForm((f) => ({ ...f, current_phase_description: e.target.value }))}
              placeholder="Describe the current phase goals, focus areas..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Next Phase Description</Label>
            <Textarea
              value={form.next_phase_description}
              onChange={(e) => setForm((f) => ({ ...f, next_phase_description: e.target.value }))}
              placeholder="Describe what comes next..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Coach Notes</Label>
            <Textarea
              value={form.coach_notes}
              onChange={(e) => setForm((f) => ({ ...f, coach_notes: e.target.value }))}
              placeholder="Notes about this phase for the client..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">📝 Additional Notes (Client-specific)</Label>
            <Textarea
              value={form.additional_notes}
              onChange={(e) => setForm((f) => ({ ...f, additional_notes: e.target.value }))}
              placeholder="Any additional notes specific to this client..."
              rows={4}
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {saving ? "Saving..." : "Save Phase Info"}
          </Button>
        </CardContent>
      </Card>

      {/* Guide Sections with Per-Client Override Controls */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              Nutrition Guides
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["coach-guide-sections", user?.id] });
                queryClient.invalidateQueries({ queryKey: ["client-guide-overrides", clientId] });
              }}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Master templates apply to all clients. Customize or hide sections for this specific client.
          </p>
        </CardHeader>
        <CardContent>
          {visibleGuides.length === 0 ? (
            <div className="text-center py-6">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                No guide sections configured yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate("/libraries?tab=guides")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Go to Master Libraries → Guides
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {CATEGORIES.map((cat) => {
                const catGuides = visibleGuides.filter((s: any) => cat.sections.includes(s.section_key));
                if (catGuides.length === 0) return null;

                return (
                  <Collapsible key={cat.key} defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-muted/20 rounded-md transition-colors group">
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                      <div className="h-2 w-2 rounded-full bg-[#D4A017]" />
                      <span className="text-sm font-semibold">{cat.label}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 mt-2 pl-2">
                      {catGuides.map((section: any) => {
                        const isEditing = overrideEditing[section.section_key];
                        const override = overrideValues[section.section_key];
                        const isHidden = override?.is_hidden;

                        return (
                          <div key={section.id} className={`rounded-lg border p-3 space-y-2 ${isHidden ? "border-destructive/30 opacity-60" : "border-border/50"}`}>
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <>
                                    <div className="flex items-center gap-1">
                                      <EyeOff className="h-3 w-3 text-muted-foreground" />
                                      <Label className="text-[10px] text-muted-foreground">Hide</Label>
                                      <Switch
                                        checked={override?.is_hidden || false}
                                        onCheckedChange={(v) => updateOverride(section.section_key, "is_hidden", v)}
                                      />
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs gap-1"
                                      onClick={() => handleResetOverride(section.section_key)}
                                      disabled={savingOverride === section.section_key}
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Reset
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs gap-1"
                                    onClick={() => enableOverride(section.section_key, section.content, section.title)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Customize
                                  </Button>
                                )}
                              </div>
                            </div>

                            {isEditing && !isHidden ? (
                              <div className="space-y-2">
                                <Input
                                  value={override?.title || ""}
                                  onChange={(e) => updateOverride(section.section_key, "title", e.target.value)}
                                  placeholder={`Custom title (leave blank to use "${section.title}")`}
                                  className="text-xs"
                                />
                                <RichTextToolbar
                                  textareaRef={{ current: textareaRefs.current[section.section_key] } as React.RefObject<HTMLTextAreaElement>}
                                  value={override?.content || ""}
                                  onChange={(v) => updateOverride(section.section_key, "content", v)}
                                />
                                <Textarea
                                  ref={(el) => { textareaRefs.current[section.section_key] = el; }}
                                  value={override?.content || ""}
                                  onChange={(e) => updateOverride(section.section_key, "content", e.target.value)}
                                  placeholder="Custom content for this client..."
                                  rows={4}
                                  className="text-xs font-mono"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveOverride(section.section_key)}
                                  disabled={savingOverride === section.section_key}
                                >
                                  <Save className="h-3 w-3 mr-1" />
                                  {savingOverride === section.section_key ? "Saving..." : "Save Override"}
                                </Button>
                              </div>
                            ) : !isHidden ? (
                              <div className="prose prose-sm prose-invert max-w-none text-xs text-muted-foreground line-clamp-4 [&_strong]:text-foreground [&_ul]:list-disc">
                                <ReactMarkdown>{section.content || "*No content*"}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="text-xs text-destructive/70 italic">Hidden for this client</p>
                            )}

                            {isEditing && (
                              <Badge variant="outline" className="text-[9px]">
                                {override?.is_hidden ? "Hidden" : "Custom Override"}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlanTab;
