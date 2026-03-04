import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Clock, Dumbbell, TrendingUp } from "lucide-react";

interface PRDetail {
  exerciseName: string;
  weight: number;
  reps: number;
  type: "weight" | "rep" | "volume";
}

interface WorkoutSummaryProps {
  workoutName: string;
  durationMinutes: number;
  totalSets: number;
  completedSets: number;
  totalVolume: number;
  exerciseCount: number;
  prs: PRDetail[];
  onDone: () => void;
}

const WorkoutSummary = ({
  workoutName,
  durationMinutes,
  totalSets,
  completedSets,
  totalVolume,
  exerciseCount,
  prs,
  onDone,
}: WorkoutSummaryProps) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-6 bg-background">
      <div className="text-center space-y-2">
        <div className="text-5xl">💪</div>
        <h1 className="text-2xl font-display font-bold text-foreground">Workout Complete!</h1>
        <p className="text-muted-foreground">{workoutName}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <Card>
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{durationMinutes}</span>
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Minutes</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <Dumbbell className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{completedSets}/{totalSets}</span>
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Sets</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{totalVolume.toLocaleString()}</span>
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">lbs Volume</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{prs.length}</span>
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">New PRs</span>
          </CardContent>
        </Card>
      </div>

      {prs.length > 0 && (
        <Card className="w-full max-w-sm border-primary/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" /> Personal Records
            </h3>
            {prs.map((pr, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium">{pr.exerciseName}</span>
                <span className="text-primary font-bold tabular-nums">
                  {pr.weight} × {pr.reps}
                  <span className="text-[10px] text-muted-foreground ml-1 uppercase">
                    {pr.type === "weight" ? "wt" : pr.type === "rep" ? "rep" : "vol"}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button onClick={onDone} size="lg" className="w-full max-w-sm">
        Done
      </Button>
    </div>
  );
};

export default WorkoutSummary;
