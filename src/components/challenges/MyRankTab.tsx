import { useMyXPSummary, useMyUserBadges, useTiers } from "@/hooks/useChallenges";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Flame, Star, Shield, ArrowUp, RotateCcw, Zap, Crown } from "lucide-react";
import TierIcon from "./TierIcon";

const MyRankTab = () => {
  const { data: summary, isLoading: summaryLoading } = useMyXPSummary();
  const { data: userBadges, isLoading: badgesLoading } = useMyUserBadges();
  const { data: tiers } = useTiers();

  if (summaryLoading || badgesLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  const tierName = summary?.tier_name || "Bronze";
  const tierColor = summary?.tier_color || "#CD7F32";
  const totalXP = summary?.total_xp || 0;

  // Find next tier
  const sortedTiers = (tiers || []).sort((a, b) => a.min_xp - b.min_xp);
  const currentTierIdx = sortedTiers.findIndex((t) => t.name === tierName);
  const nextTier = currentTierIdx >= 0 && currentTierIdx < sortedTiers.length - 1 ? sortedTiers[currentTierIdx + 1] : null;
  const xpToNext = nextTier ? nextTier.min_xp - totalXP : 0;
  const progressToNext = nextTier
    ? Math.min(100, Math.round(((totalXP - (sortedTiers[currentTierIdx]?.min_xp || 0)) / (nextTier.min_xp - (sortedTiers[currentTierIdx]?.min_xp || 0))) * 100))
    : 100;

  const tierBgMap: Record<string, string> = {
    Bronze: "bg-orange-400/10 border-orange-400/30",
    Silver: "bg-zinc-300/10 border-zinc-300/30",
    Gold: "bg-primary/10 border-primary/30",
    Elite: "bg-purple-500/15 border-purple-500/40",
  };

  const tierTextMap: Record<string, string> = {
    Bronze: "text-orange-400",
    Silver: "text-zinc-300",
    Gold: "text-primary",
    Elite: "text-purple-400",
  };

  return (
    <div className="space-y-4">
      {/* Tier Card */}
      <Card className={`border ${tierBgMap[tierName] || tierBgMap.Bronze}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 shrink-0 rounded-full flex items-center justify-center overflow-hidden ${tierBgMap[tierName]}`}>
              <TierIcon name={tierName} size={200} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${tierTextMap[tierName]}`}>{tierName}</span>
                <Badge variant="outline" className={`${tierTextMap[tierName]} border-current text-[10px]`}>
                  Tier
                </Badge>
              </div>
              <p className="text-sm font-bold text-primary mt-0.5">{totalXP.toLocaleString()} XP</p>
            </div>
          </div>

          {/* Progress to next tier */}
          {nextTier && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Next: {nextTier.name}</span>
                <span>{xpToNext} XP to go</span>
              </div>
              <Progress value={progressToNext} className="h-2" />
            </div>
          )}
          {!nextTier && totalXP > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">🏆 Maximum tier reached!</p>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Star} label="Elite Weeks" value={summary?.elite_weeks || 0} color="text-primary" />
        <StatCard icon={Flame} label="Current Streak" value={`${summary?.current_streak || 0}w`} color="text-orange-400" />
        <StatCard icon={ArrowUp} label="Longest Streak" value={`${summary?.longest_streak || 0}w`} color="text-green-400" />
        <StatCard icon={RotateCcw} label="Comebacks" value={summary?.comebacks || 0} color="text-blue-400" />
        <StatCard icon={Zap} label="Resets" value={summary?.resets || 0} color="text-purple-400" />
        <StatCard icon={Trophy} label="Lifetime Avg" value={`${summary?.lifetime_avg_pct || 0}%`} color="text-primary" />
      </div>

      {/* Badges Earned */}
      {(userBadges || []).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Badges Earned</h3>
          <div className="flex flex-wrap gap-2">
            {(userBadges || []).map((ub: any) => (
              <div key={ub.id} className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-primary">
                <span className="text-sm">{ub.badges?.icon || "🏆"}</span>
                <span className="text-xs font-medium">{ub.badges?.name || "Badge"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!summary && (
        <Card className="border-border bg-card">
          <CardContent className="py-8 text-center">
            <Trophy className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Complete challenges and maintain streaks to earn XP and climb the ranks!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) => (
  <Card className="border-border bg-card">
    <CardContent className="p-3 flex items-center gap-2.5">
      <Icon className={`h-4 w-4 ${color} shrink-0`} />
      <div>
        <p className={`text-base font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

export default MyRankTab;
