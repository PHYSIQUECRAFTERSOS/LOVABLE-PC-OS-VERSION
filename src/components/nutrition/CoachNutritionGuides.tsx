import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, BookOpen, Users } from "lucide-react";
import { toast } from "sonner";
import PhaseInfoEditor from "./PhaseInfoEditor";

const DEFAULT_SECTIONS = [
  { section_key: "water_recommendation", title: "💧 Water Recommendation", sort_order: 0 },
  { section_key: "daily_ritual", title: "🌅 Daily Morning Ritual", sort_order: 1 },
  { section_key: "nutrition_tips", title: "📋 Nutrition Tracking Tips", sort_order: 2 },
  { section_key: "meal_planning", title: "🥗 Meal Planning Recommendations", sort_order: 3 },
  { section_key: "eating_out_cheat_sheet", title: "🍽️ Eating Out Cheat Sheet", sort_order: 4 },
  { section_key: "eating_out_examples", title: "🍕 Eating Out Examples", sort_order: 5 },
  { section_key: "macro_cheat_sheet", title: "📊 Macro Replacement Chart", sort_order: 6 },
];

const CoachNutritionGuides = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<Record<string, { title: string; content: string; is_visible: boolean }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data: existingSections, isLoading } = useQuery({
    queryKey: ["coach-guide-sections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_guide_sections")
        .select("*")
        .eq("coach_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!existingSections) return;
    const map: Record<string, { title: string; content: string; is_visible: boolean }> = {};
    for (const def of DEFAULT_SECTIONS) {
      const existing = existingSections.find((s: any) => s.section_key === def.section_key);
      map[def.section_key] = {
        title: existing?.title || def.title,
        content: existing?.content || "",
        is_visible: existing?.is_visible ?? true,
      };
    }
    setSections(map);
  }, [existingSections]);

  const handleSave = async (sectionKey: string) => {
    if (!user) return;
    setSaving(sectionKey);
    const section = sections[sectionKey];
    const def = DEFAULT_SECTIONS.find((d) => d.section_key === sectionKey);

    try {
      const { error } = await supabase
        .from("nutrition_guide_sections")
        .upsert(
          {
            coach_id: user.id,
            section_key: sectionKey,
            title: section.title,
            content: section.content,
            is_visible: section.is_visible,
            sort_order: def?.sort_order || 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "coach_id,section_key" }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["coach-guide-sections"] });
      toast.success("Section saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const updateSection = (key: string, field: string, value: any) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="guides" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="guides" className="flex-1 gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Guide Sections
        </TabsTrigger>
        <TabsTrigger value="phases" className="flex-1 gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Client Phases
        </TabsTrigger>
      </TabsList>

      <TabsContent value="guides" className="space-y-4 mt-4">
        <p className="text-xs text-muted-foreground">
          These guides are shared with all your clients under their Plan tab. Toggle visibility per section.
        </p>
        {DEFAULT_SECTIONS.map((def) => {
          const section = sections[def.section_key];
          if (!section) return null;
          return (
            <Card key={def.section_key} className="border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{def.title}</CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`vis-${def.section_key}`} className="text-xs text-muted-foreground">
                        Visible
                      </Label>
                      <Switch
                        id={`vis-${def.section_key}`}
                        checked={section.is_visible}
                        onCheckedChange={(v) => updateSection(def.section_key, "is_visible", v)}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(def.section_key, "title", e.target.value)}
                  placeholder="Section title"
                  className="text-sm"
                />
                <Textarea
                  value={section.content}
                  onChange={(e) => updateSection(def.section_key, "content", e.target.value)}
                  placeholder="Enter content here... (plain text, line breaks preserved)"
                  rows={6}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => handleSave(def.section_key)}
                  disabled={saving === def.section_key}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {saving === def.section_key ? "Saving..." : "Save"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>

      <TabsContent value="phases" className="mt-4">
        <PhaseInfoEditor />
      </TabsContent>
    </Tabs>
  );
};

export default CoachNutritionGuides;
