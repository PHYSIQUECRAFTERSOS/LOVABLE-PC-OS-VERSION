import { useMyCultureProfile, useMyBadges } from "@/hooks/useCulture";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Flame, Star, Shield, ArrowUp, RotateCcw, Zap, Crown, Sparkles } from "lucide-react";
import { useActivateResetWeek } from "@/hooks/useCulture";
import { toast } from "sonner";

const badgeIcons: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  weekly_champion: { icon: Crown, label: "Weekly Champion", color: "text-primary" },
  featured_performer: { icon: Sparkles, label: "Featured Performer", color: "text-primary" },
  most_improved: { icon: ArrowUp, label: "Most Improved", color: "text-green-400" },
  comeback: { icon: RotateCcw, label: "Comeback", color: "text-blue-400" },
  reset: { icon: Zap, label: "Reset Complete", color: "text-purple-400" },
  elite_week: { icon: Star, label: "Elite Week", color: "text-primary" },
  consistency: { icon: Shield, label: "Consistency", color: "text-green-400" },
};

const tierConfig: Record<string, { label: string; color: string; bg: string }> = {
  bronze: { label: "Bronze", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30" },
  silver: { label: "Silver", color: "text-zinc-300", bg: "bg-zinc-300/10 border-zinc-300/30" },
  gold: { label: "Gold", color: "text-primary", bg: "bg-primary/10 border-primary/30" },
  elite: { label: "Elite", color: "text-primary", bg: "bg-primary/15 border-primary/40 glow-gold" },
};

const IdentityStack = () => {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyCultureProfile();
  const { data: badges, isLoading: badgesLoading } = useMyBadges();
  const activateReset = useActivateResetWeek();

  if (profileLoading || badgesLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (!profile) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="py-8 text-center">
          <Trophy className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Your culture profile will appear after the first weekly calculation.</p>
        </CardContent>
      </Card>
    );
  }

  const tier = tierConfig[profile.tier] || tierConfig.bronze;

  // Unique badge types earned
  const uniqueBadgeTypes = [...new Set((badges || []).map((b) => b.badge_type))];

  return (
    <div className="space-y-4">
      {/* Tier Card */}
      <Card className={`border ${tier.bg}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className={`h-16 w-16 ${profile.consistency_active ? "ring-2 ring-green-500" : ""}`}>
                <AvatarFallback className={`text-lg font-bold ${tier.color} bg-background`}>
                  {tier.label[0]}
                </AvatarFallback>
              </Avatar>
              {profile.consistency_active && (
                <span className="absolute -bottom-1 -right-1 text-[10px] bg-green-500/20 text-green-400 rounded-full px-1.5 py-0.5 font-semibold">
                  ●
                </span>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${tier.color}`}>{tier.label}</span>
                <Badge variant="outline" className={`${tier.color} border-current text-[10px]`}>
                  Tier
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {profile.consistency_active ? "Consistency Active" : "Keep pushing for consistency"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={Star} label="Elite Weeks" value={profile.total_elite_weeks} color="text-primary" />
        <StatCard icon={Flame} label="Current Streak" value={`${profile.current_streak}w`} color="text-orange-400" />
        <StatCard icon={ArrowUp} label="Most Improved" value={profile.most_improved_count} color="text-green-400" />
        <StatCard icon={RotateCcw} label="Comebacks" value={profile.comeback_count} color="text-blue-400" />
        <StatCard icon={Zap} label="Resets" value={profile.reset_count} color="text-purple-400" />
        <StatCard icon={Trophy} label="Lifetime Avg" value={`${profile.lifetime_avg}%`} color="text-primary" />
      </div>

      {/* Reset Week */}
      {profile.reset_week_eligible && !profile.reset_week_active && (
        <Card className="border-purple-400/30 bg-purple-400/5">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-400">Reset Week Available</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete the requirements to earn your Reset Badge
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-purple-400/30 text-purple-400 hover:bg-purple-400/10"
              onClick={() => {
                activateReset.mutate();
                toast.success("Reset Week activated! Give it your all this week.");
              }}
            >
              <Zap className="h-3.5 w-3.5 mr-1" /> Activate
            </Button>
          </CardContent>
        </Card>
      )}

      {profile.reset_week_active && (
        <Card className="border-purple-400/30 bg-purple-400/5">
          <CardContent className="pt-4 pb-4 text-center">
            <Zap className="h-6 w-6 mx-auto text-purple-400 mb-1" />
            <p className="text-sm font-semibold text-purple-400">Reset Week Active</p>
            <p className="text-xs text-muted-foreground mt-1">
              80% workouts · 5 compliant days · On-time check-in · 1 community post
            </p>
          </CardContent>
        </Card>
      )}

      {/* Badges Earned */}
      {uniqueBadgeTypes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Badges Earned</h3>
          <div className="flex flex-wrap gap-2">
            {uniqueBadgeTypes.map((type) => {
              const config = badgeIcons[type];
              if (!config) return null;
              const count = (badges || []).filter((b) => b.badge_type === type).length;
              const Icon = config.icon;

              return (
                <div
                  key={type}
                  className={`flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 ${config.color}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">{config.label}</span>
                  {count > 1 && (
                    <span className="text-[10px] bg-background rounded-full px-1.5 py-0.5 font-bold">×{count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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

export default IdentityStack;
