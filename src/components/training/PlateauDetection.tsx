import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, TrendingDown, RotateCcw, Shuffle, Minus, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PlateauFlag {
  id: string;
  client_id: string;
  exercise_id: string;
  workout_id: string;
  flagged_at: string;
  resolved_at: string | null;
  resolution: string | null;
  stagnant_sessions: number;
  last_weight: number | null;
  last_reps: number | null;
  last_rpe: number | null;
  exercise_name?: string;
  client_name?: string;
}

const PlateauDetection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [flags, setFlags] = useState<PlateauFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadFlags = async () => {
      setLoading(true);
      // Get unresolved plateau flags for this coach's clients
      const { data } = await supabase
        .from("plateau_flags")
        .select("*, exercises(name), profiles!plateau_flags_client_id_fkey(full_name)")
        .is("resolved_at", null)
        .order("flagged_at", { ascending: false });

      if (data) {
        setFlags(data.map((f: any) => ({
          ...f,
          exercise_name: f.exercises?.name || "Unknown",
          client_name: f.profiles?.full_name || f.client_id.slice(0, 8),
        })));
      }
      setLoading(false);
    };
    loadFlags();
  }, [user]);

  const resolveFlag = async (flagId: string, resolution: string) => {
    setResolving(flagId);
    const { error } = await supabase
      .from("plateau_flags")
      .update({ resolved_at: new Date().toISOString(), resolution })
      .eq("id", flagId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setFlags(flags.filter(f => f.id !== flagId));
      toast({ title: "Plateau flag resolved" });
    }
    setResolving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-sm text-muted-foreground">
            No plateau flags detected. Your clients are progressing well.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="font-semibold text-sm text-foreground">
          Plateau Alerts ({flags.length})
        </h3>
      </div>
      {flags.map((flag) => (
        <Card key={flag.id} className="border-destructive/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm">{flag.client_name}</p>
                <p className="text-xs text-muted-foreground">{flag.exercise_name}</p>
                <div className="flex gap-2 mt-1.5">
                  {flag.last_weight && (
                    <Badge variant="secondary" className="text-[10px]">
                      {flag.last_weight} lbs
                    </Badge>
                  )}
                  {flag.last_reps && (
                    <Badge variant="secondary" className="text-[10px]">
                      {flag.last_reps} reps
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {flag.stagnant_sessions} sessions stagnant
                  </Badge>
                </div>
              </div>
              <Badge variant="destructive" className="text-[10px]">Plateau</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" variant="outline"
                className="text-xs h-7 gap-1"
                disabled={resolving === flag.id}
                onClick={() => resolveFlag(flag.id, "deload_week")}
              >
                <RotateCcw className="h-3 w-3" /> Deload Week
              </Button>
              <Button
                size="sm" variant="outline"
                className="text-xs h-7 gap-1"
                disabled={resolving === flag.id}
                onClick={() => resolveFlag(flag.id, "swap_exercise")}
              >
                <Shuffle className="h-3 w-3" /> Swap Exercise
              </Button>
              <Button
                size="sm" variant="outline"
                className="text-xs h-7 gap-1"
                disabled={resolving === flag.id}
                onClick={() => resolveFlag(flag.id, "reduce_volume")}
              >
                <Minus className="h-3 w-3" /> Reduce Volume
              </Button>
              <Button
                size="sm" variant="outline"
                className="text-xs h-7 gap-1"
                disabled={resolving === flag.id}
                onClick={() => resolveFlag(flag.id, "increase_rest")}
              >
                <Clock className="h-3 w-3" /> Increase Rest
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PlateauDetection;
