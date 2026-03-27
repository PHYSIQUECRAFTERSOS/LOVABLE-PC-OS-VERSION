import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, ArrowRight } from "lucide-react";
import GroceryList from "./GroceryList";
import GuideSection, { SECTION_ICONS } from "./GuideSection";

const ClientNutritionHub = () => {
  const { user } = useAuth();

  // Fetch phase info
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

  // Fetch coach ID for this client
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

  // Fetch guide sections from assigned coach (excluding additional_notes which is per-client)
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

  return (
    <div className="space-y-4">
      {/* Grocery List */}
      <GroceryList />

      {/* Phase Info */}
      {phaseInfo && (phaseInfo.current_phase_name || phaseInfo.coach_notes) && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Current Phase
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {phaseInfo.current_phase_name && (
              <div className="flex items-center gap-3">
                <Badge className="bg-primary/20 text-primary">
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

      {/* Guide Sections */}
      {guideSections?.map((section: any) => (
        <GuideSection
          key={section.id}
          title={section.title}
          content={section.content}
          icon={
            SECTION_ICONS[section.section_key] ? (
              <span className="text-base">{SECTION_ICONS[section.section_key]}</span>
            ) : undefined
          }
        />
      ))}

      {/* Empty state */}
      {!phaseInfo && (!guideSections || guideSections.length === 0) && (
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
