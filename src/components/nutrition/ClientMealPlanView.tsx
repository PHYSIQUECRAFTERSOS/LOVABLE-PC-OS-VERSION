import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Clock, Eye, Calendar } from "lucide-react";
import { format } from "date-fns";

interface MealPlanUpload {
  id: string;
  client_id: string;
  coach_id: string;
  storage_path: string;
  file_name: string;
  version: number;
  coach_notes: string | null;
  effective_date: string;
  is_active: boolean;
  client_viewed_at: string | null;
  created_at: string;
}

const ClientMealPlanView = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: plans, isLoading } = useQuery({
    queryKey: ["client-meal-plans", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_meal_plan_uploads")
        .select("*")
        .eq("client_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MealPlanUpload[];
    },
    enabled: !!user,
  });

  const activePlan = plans?.find((p) => p.is_active);

  // Mark active plan as viewed
  useEffect(() => {
    if (activePlan && !activePlan.client_viewed_at && user) {
      supabase
        .from("coach_meal_plan_uploads")
        .update({ client_viewed_at: new Date().toISOString() })
        .eq("id", activePlan.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["client-meal-plans"] });
        });
    }
  }, [activePlan, user, queryClient]);

  const handleView = async (plan: MealPlanUpload) => {
    const { data } = await supabase.storage
      .from("meal-plans")
      .createSignedUrl(plan.storage_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");

    // Mark as viewed if not already
    if (!plan.client_viewed_at) {
      await supabase
        .from("coach_meal_plan_uploads")
        .update({ client_viewed_at: new Date().toISOString() })
        .eq("id", plan.id);
      queryClient.invalidateQueries({ queryKey: ["client-meal-plans"] });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading meal plan...
        </CardContent>
      </Card>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            No meal plan assigned yet. Your coach will upload one when ready.
          </p>
        </CardContent>
      </Card>
    );
  }

  const olderPlans = plans.filter((p) => !p.is_active);

  return (
    <div className="space-y-4">
      {/* Active Plan */}
      {activePlan && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                Current Meal Plan
              </CardTitle>
              <Badge>v{activePlan.version}</Badge>
            </div>
            <CardDescription>{activePlan.file_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Effective: {format(new Date(activePlan.effective_date), "MMM d, yyyy")}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated: {format(new Date(activePlan.created_at), "MMM d, yyyy")}
              </span>
              {activePlan.client_viewed_at && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Viewed {format(new Date(activePlan.client_viewed_at), "MMM d, h:mm a")}
                </span>
              )}
            </div>

            {activePlan.coach_notes && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Coach Notes</p>
                <p className="text-sm">{activePlan.coach_notes}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => handleView(activePlan)} className="flex-1 md:flex-none">
                <Eye className="h-4 w-4 mr-2" />
                View Plan
              </Button>
              <Button variant="outline" onClick={() => handleView(activePlan)}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Version History */}
      {olderPlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Previous Versions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {olderPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div>
                    <p className="text-sm font-medium">{plan.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      v{plan.version} • {format(new Date(plan.effective_date), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleView(plan)}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientMealPlanView;
