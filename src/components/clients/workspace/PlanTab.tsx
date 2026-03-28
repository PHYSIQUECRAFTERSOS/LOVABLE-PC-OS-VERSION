import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Target, BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_SECTIONS = [
  { section_key: "water_recommendation", title: "💧 Water Recommendation" },
  { section_key: "daily_ritual", title: "🌅 Daily Morning Ritual" },
  { section_key: "nutrition_tips", title: "📋 Nutrition Tracking Tips" },
  { section_key: "meal_planning", title: "🥗 Meal Planning Recommendations" },
  { section_key: "eating_out_cheat_sheet", title: "🍽️ Eating Out Cheat Sheet" },
  { section_key: "eating_out_examples", title: "🍕 Eating Out Examples" },
  { section_key: "macro_cheat_sheet", title: "📊 Macro Replacement Chart" },
];

const PlanTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    current_phase_name: "",
    current_phase_description: "",
    next_phase_name: "",
    next_phase_description: "",
    coach_notes: "",
    additional_notes: "",
  });
  const [saving, setSaving] = useState(false);

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

  // Build visible guide sections
  const visibleGuides = (guideSections || []).filter((s: any) => s.is_visible && s.content);

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
            <Label className="text-xs">Coach Notes (Phase-specific)</Label>
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

      {/* Guide Sections Preview */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              Nutrition Guides (Client View Preview)
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">Read-only</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Edit global guide templates in Nutrition → Guides tab.
          </p>
        </CardHeader>
        <CardContent>
          {visibleGuides.length === 0 ? (
            <div className="text-center py-6">
              <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                No guide sections configured yet. Go to Nutrition → Guides to set them up.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGuides.map((section: any) => (
                <div key={section.id} className="rounded-lg border border-border/50 p-3">
                  <h4 className="text-sm font-semibold text-foreground mb-1">{section.title}</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4">
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlanTab;
