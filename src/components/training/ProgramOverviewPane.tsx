import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Layers, Dumbbell, Users, ChevronRight } from "lucide-react";

export interface OverviewPhase {
  id: string;
  name: string;
  phase_order: number;
  duration_weeks: number;
  description: string | null;
  workoutCount: number;
}

interface ProgramOverviewPaneProps {
  programId: string;
  programName: string;
  programDescription?: string | null;
  isMaster?: boolean;
  versionNumber?: number | null;
  onSelectPhase: (phaseId: string) => void;
  onAssignPhase: (phaseId: string) => void;
  /** Optional refresh trigger key — bump to refetch */
  refreshKey?: number;
}

const ProgramOverviewPane = ({
  programId,
  programName,
  programDescription,
  isMaster,
  versionNumber,
  onSelectPhase,
  onAssignPhase,
  refreshKey,
}: ProgramOverviewPaneProps) => {
  const [phases, setPhases] = useState<OverviewPhase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: phaseRows } = await supabase
        .from("program_phases")
        .select("id, name, phase_order, duration_weeks, description")
        .eq("program_id", programId)
        .order("phase_order");

      const ids = (phaseRows || []).map((p: any) => p.id);
      const counts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: pws } = await supabase
          .from("program_workouts")
          .select("phase_id")
          .in("phase_id", ids);
        (pws || []).forEach((pw: any) => {
          counts[pw.phase_id] = (counts[pw.phase_id] || 0) + 1;
        });
      }

      if (cancelled) return;
      setPhases(
        (phaseRows || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          phase_order: p.phase_order,
          duration_weeks: p.duration_weeks,
          description: p.description,
          workoutCount: counts[p.id] || 0,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [programId, refreshKey]);

  const totalWeeks = phases.reduce((s, p) => s + (p.duration_weeks || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-bold text-foreground">{programName}</h2>
          {isMaster && (
            <Badge className="text-[10px] bg-primary/20 text-primary">Master</Badge>
          )}
          {versionNumber != null && (
            <Badge variant="outline" className="text-[10px]">
              v{versionNumber}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {programDescription || (
            <span className="italic text-muted-foreground/70">Say something about this program…</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {phases.length} phase{phases.length !== 1 ? "s" : ""} · {totalWeeks} week
          {totalWeeks !== 1 ? "s" : ""} total
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
        ) : phases.length === 0 ? (
          <div className="col-span-full text-center py-12 border border-dashed rounded-lg">
            <Layers className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No phases yet.</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Add a phase from the workout view.
            </p>
          </div>
        ) : (
          phases.map((p) => (
            <Card
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectPhase(p.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPhase(p.id);
                }
              }}
              className="border-l-4 border-l-primary/40 cursor-pointer hover:border-l-primary hover:bg-muted/30 transition-colors"
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="font-semibold text-sm text-foreground truncate">{p.name}</h3>
                    </div>
                    {p.description && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {p.duration_weeks} week{p.duration_weeks !== 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Dumbbell className="h-2.5 w-2.5" /> {p.workoutCount} workout
                    {p.workoutCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignPhase(p.id);
                  }}
                >
                  <Users className="h-3 w-3 mr-1" /> Assign Phase to Client
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default ProgramOverviewPane;
