import { useChallengeLeaderboard, type LeaderboardEntry } from "@/hooks/useChallenges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Search, Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";



const GlobalLeaderboard = () => {
  const { data: leaders, isLoading } = useChallengeLeaderboard();
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const filtered = search
    ? (leaders || []).filter((l) => l.full_name?.toLowerCase().includes(search.toLowerCase()))
    : leaders || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 bg-secondary/30 border-0 text-sm"
        />
      </div>

      {!filtered.length ? (
        <div className="text-center py-12">
          <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? "No matching members found." : "No challenge participants yet. Join a challenge to appear here!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const initials = (entry.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const isTop3 = entry.rank <= 3;
            const isMe = entry.user_id === user?.id;

            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                  isMe ? "border-primary/30 bg-primary/5" : isTop3 ? "border-primary/20 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <span className="w-8 text-center font-bold text-sm text-muted-foreground shrink-0">
                  #{entry.rank}
                </span>

                <div className="relative">
                  <Avatar className="h-9 w-9">
                    {entry.avatar_url && <AvatarImage src={entry.avatar_url} />}
                    <AvatarFallback className={isTop3 ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {entry.rank === 1 && !search && <Crown className="absolute -top-2 -right-1 h-4 w-4 text-primary" />}
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">{entry.full_name}</span>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-primary font-bold text-sm">
                    <Trophy className="h-3.5 w-3.5" />
                    {entry.total_points.toLocaleString()}
                  </div>
                  <p className="text-[10px] text-muted-foreground">pts</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GlobalLeaderboard;
