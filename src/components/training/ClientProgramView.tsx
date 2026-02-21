import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, ChevronDown, ChevronUp, Calendar, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy", strength: "Strength", fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding", athletic: "Athletic", general: "General Fitness", recomp: "Recomp",
};

interface ClientProgramViewProps {
  onStartWorkout: (workoutId: string) => void;
}

const ClientProgramView = ({ onStartWorkout }: ClientProgramViewProps) => {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);
  const [programDetails, setProgramDetails] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadPrograms = async () => {
      const { data } = await supabase
        .from("programs")
        .select("id, name, description, goal_type, start_date, end_date")
        .eq("client_id", user.id)
        .eq("is_template", false)
        .order("created_at", { ascending: false });
      setPrograms(data || []);
      setLoading(false);
    };
    loadPrograms();
  }, [user]);

  const toggleProgram = async (programId: string) => {
    if (expandedProgram === programId) {
      setExpandedProgram(null);
      return;
    }
    setExpandedProgram(programId);

    if (programDetails[programId]) return;

    setLoadingDetails(programId);
    const { data: weeks } = await supabase
      .from("program_weeks")
      .select("id, week_number, name")
      .eq("program_id", programId)
      .order("week_number");

    if (weeks && weeks.length > 0) {
      const weekIds = weeks.map(w => w.id);
      const { data: pwRows } = await supabase
        .from("program_workouts")
        .select("id, week_id, workout_id, day_of_week, day_label, sort_order, workouts(id, name, description)")
        .in("week_id", weekIds)
        .order("sort_order");

      const detail = weeks.map(w => ({
        ...w,
        workouts: (pwRows || [])
          .filter(pw => pw.week_id === w.id)
          .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0)),
      }));

      setProgramDetails(prev => ({ ...prev, [programId]: detail }));
    } else {
      setProgramDetails(prev => ({ ...prev, [programId]: [] }));
    }
    setLoadingDetails(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground text-sm">
            No programs assigned yet. Your coach will assign a program to you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {programs.map((program) => (
        <Card key={program.id} className="overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => toggleProgram(program.id)}
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-foreground">{program.name}</h3>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {GOAL_LABELS[program.goal_type] || program.goal_type}
                </Badge>
                {program.start_date && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Calendar className="h-2.5 w-2.5" />
                    {new Date(program.start_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            {expandedProgram === program.id
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>

          {expandedProgram === program.id && (
            <CardContent className="pt-0 space-y-4">
              {program.description && (
                <p className="text-xs text-muted-foreground">{program.description}</p>
              )}

              {loadingDetails === program.id ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                (programDetails[program.id] || []).map((week: any) => (
                  <div key={week.id} className="space-y-2">
                    <h4 className="text-sm font-medium text-foreground">{week.name}</h4>
                    {week.workouts.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-2">No workouts this week</p>
                    ) : (
                      <div className="space-y-2">
                        {week.workouts.map((pw: any) => (
                          <div key={pw.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card/50">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {(pw.workouts as any)?.name || "Workout"}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {DAY_LABELS[pw.day_of_week ?? 0]}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStartWorkout((pw.workouts as any)?.id || pw.workout_id);
                              }}
                            >
                              <Play className="h-3.5 w-3.5 mr-1" /> Start
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
};

export default ClientProgramView;
