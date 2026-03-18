import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Clock, Dumbbell, TrendingUp, Flame, Share2, Zap, ChevronUp } from "lucide-react";
import TierBadge from "@/components/ranked/TierBadge";
import { getDivisionLabel, getTierColor } from "@/utils/rankedXP";

interface PRDetail {
  exerciseName: string;
  weight: number;
  reps: number;
  type: "weight" | "rep" | "volume";
}

interface RankData {
  xpEarned: number;
  tier: string;
  division: number;
  divisionXP: number;
  xpNeeded: number;
  totalXP: number;
}

interface WorkoutSummaryProps {
  workoutName: string;
  durationSeconds: number;
  totalSets: number;
  completedSets: number;
  totalVolume: number;
  exerciseCount: number;
  prs: PRDetail[];
  isFirstSession?: boolean;
  rankData?: RankData | null;
  onDone: () => void;
}

const POSITIVE_MESSAGES = [
  "You showed up. That's what champions do. 🏆",
  "Another session in the books. Stay consistent. 🔥",
  "Hard work compounds. You're building something great. 💪",
  "Rest up, recover, and come back stronger. ✅",
  "Your future self is grateful for what you just did. 🚀",
];

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const WorkoutSummary = ({
  workoutName,
  durationSeconds,
  totalSets,
  completedSets,
  totalVolume,
  exerciseCount,
  prs,
  isFirstSession,
  rankData,
  onDone,
}: WorkoutSummaryProps) => {
  const message = useMemo(() => {
    if (isFirstSession) return "First session logged! Every rep from here is progress. Welcome to your journey. 🚀";
    if (prs.length >= 2) return `You crushed ${prs.length} PRs today! Incredible session. 🔥🏆`;
    if (prs.length === 1) return "You hit a new PR today! Keep pushing! 💪";
    return POSITIVE_MESSAGES[Math.floor(Math.random() * POSITIVE_MESSAGES.length)];
  }, [prs.length, isFirstSession]);

  const rankProgress = rankData && rankData.xpNeeded > 0
    ? (rankData.divisionXP / rankData.xpNeeded) * 100
    : rankData ? 100 : 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-6 bg-background animate-fade-in">
      {/* Hero */}
      <div className="text-center space-y-2">
        <div className="text-5xl">{prs.length > 0 ? "🏆" : "💪"}</div>
        <h1 className="text-2xl font-display font-bold text-foreground">Workout Complete!</h1>
        <p className="text-muted-foreground">{workoutName}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <Card>
          <CardContent className="p-4 flex flex-col items-center gap-1">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{formatDuration(durationSeconds)}</span>
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Duration</span>
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
            <Flame className="h-5 w-5 text-primary" />
            <span className="text-xl font-bold tabular-nums">{exerciseCount}</span>
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Exercises</span>
          </CardContent>
        </Card>
      </div>

      {/* PR Section */}
      {prs.length > 0 && (
        <Card className="w-full max-w-sm border-primary/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" /> Personal Records This Session
            </h3>
            {prs.map((pr, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-medium">{pr.exerciseName}</span>
                <span className="text-primary font-bold tabular-nums">
                  → {pr.weight} lb × {pr.reps}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* XP & Rank Section */}
      {rankData && (
        <Card className="w-full max-w-sm border-primary/30">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Ranked Progress
            </h3>
            
            {/* XP Earned */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">XP Earned</span>
              <span className="text-lg font-bold text-primary tabular-nums">
                +{rankData.xpEarned} XP
              </span>
            </div>

            {/* Current Rank */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <TierBadge tier={rankData.tier} size={40} />
              </div>
              <div className="flex-1">
                <p
                  className="text-sm font-bold"
                  style={{ color: getTierColor(rankData.tier) }}
                >
                  {getDivisionLabel(rankData.tier, rankData.division)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {rankData.totalXP.toLocaleString()} total XP
                </p>
              </div>
            </div>

            {/* Progress to next division */}
            {rankData.tier !== "champion" && rankData.xpNeeded > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ChevronUp className="h-3 w-3" /> Next Division
                  </span>
                  <span className="tabular-nums">
                    {rankData.xpNeeded - rankData.divisionXP} XP to go
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${rankProgress}%`,
                      backgroundColor: getTierColor(rankData.tier),
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Motivational Message */}
      <p className="text-sm text-muted-foreground text-center max-w-xs">{message}</p>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-2">
        <Button variant="outline" className="w-full gap-2" disabled>
          <Share2 className="h-4 w-4" /> Share Workout
          <span className="text-[10px] text-muted-foreground ml-auto">Coming Soon</span>
        </Button>
        <Button onClick={onDone} size="lg" className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
};

export default WorkoutSummary;
