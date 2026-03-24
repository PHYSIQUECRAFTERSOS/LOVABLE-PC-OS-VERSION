import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Clock, Dumbbell, TrendingUp, Flame, Share2, Zap, ChevronUp } from "lucide-react";
import TierBadge from "@/components/ranked/TierBadge";
import { getDivisionLabel, getTierColor } from "@/utils/rankedXP";
import AnimatedNumber from "./AnimatedNumber";
import ConfettiBurst from "./ConfettiBurst";

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

const formatDurationAnimated = (current: number) => {
  const h = Math.floor(current / 3600);
  const m = Math.floor((current % 3600) / 60);
  const s = current % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/* ──────────────── Stat Card ──────────────── */
const StatCard = ({
  icon: Icon,
  delay,
  children,
}: {
  icon: React.ElementType;
  delay: number;
  children: React.ReactNode;
}) => (
  <Card
    className="animate-stagger-fade-up"
    style={{ animationDelay: `${delay}ms` }}
  >
    <CardContent className="p-4 flex flex-col items-center gap-1">
      <Icon className="h-5 w-5 text-primary" />
      {children}
    </CardContent>
  </Card>
);

/* ──────────────── PR Row ──────────────── */
const PRRow = ({ pr, index }: { pr: PRDetail; index: number }) => (
  <div
    className="flex items-center justify-between text-sm animate-stagger-fade-up relative overflow-hidden rounded-md px-2 py-1"
    style={{ animationDelay: `${2200 + index * 200}ms` }}
  >
    <div className="absolute inset-0 animate-shimmer-sweep rounded-md" style={{ animationDelay: `${2400 + index * 200}ms` }} />
    <span className="font-medium relative z-[1]">{pr.exerciseName}</span>
    <span className="text-primary font-bold tabular-nums relative z-[1]">
      → {pr.weight} lb × {pr.reps}
    </span>
  </div>
);

/* ──────────────── XP Section ──────────────── */
const XPSection = ({ rankData, rankProgress }: { rankData: RankData; rankProgress: number }) => (
  <Card
    className="w-full max-w-sm border-primary/30 animate-stagger-fade-up"
    style={{ animationDelay: "3000ms" }}
  >
    <CardContent className="p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" /> Ranked Progress
      </h3>

      {/* XP Earned */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">XP Earned</span>
        <span className="text-lg font-bold text-primary tabular-nums">
          +<AnimatedNumber value={rankData.xpEarned} delay={3200} duration={600} /> XP
        </span>
      </div>

      {/* Current Rank */}
      <div className="flex items-center gap-3">
        <div
          className="w-20 h-20 flex items-center justify-center rounded-full animate-glow-pulse"
          style={{ animationDelay: "3800ms" }}
        >
          <TierBadge tier={rankData.tier} size={80} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: getTierColor(rankData.tier) }}>
            {getDivisionLabel(rankData.tier, rankData.division)}
          </p>
          <p className="text-xs text-muted-foreground">
            {rankData.totalXP.toLocaleString()} total XP
          </p>
        </div>
      </div>

      {/* Progress bar */}
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
              className="h-full rounded-full"
              style={{
                width: `${rankProgress}%`,
                backgroundColor: getTierColor(rankData.tier),
                animation: `xp-fill 700ms ease-out 3500ms both`,
              }}
            />
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

/* ══════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════ */
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

  const rankProgress =
    rankData && rankData.xpNeeded > 0
      ? (rankData.divisionXP / rankData.xpNeeded) * 100
      : rankData
        ? 100
        : 0;

  const hasPRs = prs.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-6 bg-background relative overflow-hidden">
      {/* Confetti — fires only for PR sessions */}
      <ConfettiBurst fire={hasPRs} delay={1800} />

      {/* Hero */}
      <div className="text-center space-y-2 relative z-[2]">
        <div
          className="text-5xl animate-hero-bounce-in"
          style={{ animationDelay: "300ms" }}
        >
          {hasPRs ? "🏆" : "💪"}
        </div>
        <h1
          className="text-2xl font-display font-bold text-foreground animate-stagger-fade-up"
          style={{ animationDelay: "500ms" }}
        >
          Workout Complete!
        </h1>
        <p
          className="text-muted-foreground animate-stagger-fade-up"
          style={{ animationDelay: "700ms" }}
        >
          {workoutName}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm relative z-[2]">
        <StatCard icon={Clock} delay={900}>
          <AnimatedNumber
            value={durationSeconds}
            delay={1000}
            formatFn={formatDurationAnimated}
            className="text-xl font-bold tabular-nums"
          />
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Duration</span>
        </StatCard>

        <StatCard icon={Dumbbell} delay={1000}>
          <span className="text-xl font-bold tabular-nums">
            <AnimatedNumber value={completedSets} delay={1100} />/{totalSets}
          </span>
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Sets</span>
        </StatCard>

        <StatCard icon={TrendingUp} delay={1100}>
          <AnimatedNumber
            value={totalVolume}
            delay={1200}
            className="text-xl font-bold tabular-nums"
          />
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">lbs Volume</span>
        </StatCard>

        <StatCard icon={Flame} delay={1200}>
          <AnimatedNumber
            value={exerciseCount}
            delay={1300}
            className="text-xl font-bold tabular-nums"
          />
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Exercises</span>
        </StatCard>
      </div>

      {/* PR Section */}
      {hasPRs && (
        <Card
          className="w-full max-w-sm border-primary/30 animate-stagger-fade-up relative z-[2]"
          style={{ animationDelay: "2000ms" }}
        >
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <span className="animate-trophy-burst inline-block" style={{ animationDelay: "2000ms" }}>
                <Trophy className="h-4 w-4 text-primary" />
              </span>
              Personal Records This Session
            </h3>
            {prs.map((pr, i) => (
              <PRRow key={i} pr={pr} index={i} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* XP & Rank */}
      {rankData && <XPSection rankData={rankData} rankProgress={rankProgress} />}

      {/* Motivational Message */}
      <p
        className="text-sm text-muted-foreground text-center max-w-xs animate-stagger-fade-up relative z-[2]"
        style={{ animationDelay: "4000ms" }}
      >
        {message}
      </p>

      {/* Actions */}
      <div
        className="w-full max-w-sm space-y-2 animate-stagger-fade-up relative z-[2]"
        style={{ animationDelay: "4200ms" }}
      >
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
