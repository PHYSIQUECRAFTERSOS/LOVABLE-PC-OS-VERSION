import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, ArrowRight } from "lucide-react";
import GroceryList from "./GroceryList";
import GuideSection, { SECTION_ICONS } from "./GuideSection";

const CATEGORIES = [
  { key: "hydration", label: "💧 Hydration", sections: ["water_recommendation"] },
  { key: "daily_habits", label: "☀️ Daily Habits", sections: ["daily_ritual"] },
  { key: "tracking", label: "📋 Tracking & Planning", sections: ["why_macros_matter", "nutrition_tips", "meal_planning"] },
  { key: "eating_out", label: "🍽️ Eating Out", sections: ["eating_out_cheat_sheet", "eating_out_examples"] },
  { key: "reference", label: "📊 Reference", sections: ["macro_cheat_sheet"] },
];

const ClientNutritionHub = () => {
  const { user } = useAuth();

  const { data: phaseInfo } = useQuery({
    queryKey: ["client-phase-info", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_phase_info")
        .select("*")
        .eq("client_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: coachLink } = useQuery({
    queryKey: ["client-coach-link", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: guideSections } = useQuery({
    queryKey: ["nutrition-guide-sections", coachLink?.coach_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_guide_sections")
        .select("*")
        .eq("coach_id", coachLink!.coach_id)
        .eq("is_visible", true)
        .neq("section_key", "additional_notes")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!coachLink?.coach_id,
  });

  const { data: overrides } = useQuery({
    queryKey: ["client-guide-overrides", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_guide_overrides")
        .select("*")
        .eq("client_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const mergedGuides = (guideSections || [])
    .map((master: any) => {
      const override = (overrides || []).find((o: any) => o.section_key === master.section_key);
      if (override?.is_hidden) return null;
      if (override) {
        return {
          ...master,
          content: override.content || master.content,
          title: override.title || master.title,
        };
      }
      return master;
    })
    .filter(Boolean);

  // Flatten all guides in category order for smooth feed
  const orderedGuides = CATEGORIES.flatMap((cat) =>
    mergedGuides.filter((s: any) => cat.sections.includes(s.section_key))
  );

  // Deduplicate (in case a section appears in multiple categories)
  const seen = new Set<string>();
  const uniqueGuides = orderedGuides.filter((s: any) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  return (
    <div className="space-y-4">
      <GroceryList />

      {/* Phase Info */}
      {phaseInfo && (phaseInfo.current_phase_name || phaseInfo.coach_notes) && (
        <Card className="border-[hsl(var(--primary))]/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-[hsl(var(--primary))]" />
              Current Phase
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {phaseInfo.current_phase_name && (
              <div className="flex items-center gap-3">
                <Badge className="bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">
                  {phaseInfo.current_phase_name}
                </Badge>
                {phaseInfo.next_phase_name && (
                  <>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline">{phaseInfo.next_phase_name}</Badge>
                  </>
                )}
              </div>
            )}
            {phaseInfo.current_phase_description && (
              <p className="text-sm text-muted-foreground">{phaseInfo.current_phase_description}</p>
            )}
            {phaseInfo.coach_notes && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Coach Notes</p>
                <p className="text-sm whitespace-pre-wrap">{phaseInfo.coach_notes}</p>
              </div>
            )}
            {phaseInfo.next_phase_description && (
              <div className="bg-muted/20 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Next Phase</p>
                <p className="text-sm text-muted-foreground">{phaseInfo.next_phase_description}</p>
              </div>
            )}
            {(phaseInfo as any).additional_notes && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">📝 Additional Notes</p>
                <p className="text-sm whitespace-pre-wrap">{(phaseInfo as any).additional_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guide Sections — smooth scrolling feed */}
      {uniqueGuides.length > 0 && (
        <div className="space-y-4">
          {uniqueGuides.map((section: any, i: number) => (
            <div
              key={section.id}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
            >
              <GuideSection
                title={section.title}
                content={section.content}
                sectionKey={section.section_key}
                icon={
                  SECTION_ICONS[section.section_key] ? (
                    <span className="text-base">{SECTION_ICONS[section.section_key]}</span>
                  ) : undefined
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!phaseInfo && (!uniqueGuides || uniqueGuides.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Your coach hasn't set up nutrition guides yet. Check back soon!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientNutritionHub;
