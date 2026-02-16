import { useLeaderboard } from "@/hooks/useCommunity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Flame, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const medals = ["🥇", "🥈", "🥉"];

const Leaderboard = () => {
  const { data: leaders, isLoading } = useLeaderboard();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!leaders?.length) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No engagement data yet. Start posting!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leaders.map((entry, i) => {
        const initials = (entry.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
        const isTop3 = i < 3;

        return (
          <div
            key={entry.user_id}
            className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
              isTop3 ? "border-primary/30 bg-primary/5" : "border-border bg-card"
            }`}
          >
            <span className="w-8 text-center font-bold text-lg">
              {i < 3 ? medals[i] : <span className="text-muted-foreground text-sm">#{i + 1}</span>}
            </span>
            <Avatar className="h-9 w-9">
              {entry.avatar_url && <AvatarImage src={entry.avatar_url} />}
              <AvatarFallback className={isTop3 ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground truncate">{entry.full_name}</span>
                {(entry.role === "coach" || entry.role === "admin") && (
                  <Badge variant="outline" className="border-primary/30 text-primary text-[8px] px-1 py-0">
                    Coach
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                {entry.current_streak > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-primary">
                    <Flame className="h-3 w-3" /> {entry.current_streak}d streak
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {entry.total_posts} posts · {entry.total_comments} comments
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-primary font-bold text-sm">
                <Star className="h-3.5 w-3.5" />
                {entry.engagement_score}
              </div>
              <span className="text-[10px] text-muted-foreground">pts</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Leaderboard;
